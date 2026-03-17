use serde_json::{Map, Number, Value};

fn has_key(source: &Map<String, Value>, keys: &[&str]) -> bool {
    keys.iter().any(|key| source.contains_key(*key))
}

fn read_number(source: &Map<String, Value>, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|key| match source.get(*key) {
        Some(Value::Number(value)) => value.as_f64(),
        Some(Value::String(value)) => value.trim().parse::<f64>().ok(),
        _ => None,
    })
}

fn read_bool(source: &Map<String, Value>, keys: &[&str]) -> Option<bool> {
    keys.iter().find_map(|key| source.get(*key).and_then(Value::as_bool))
}

fn number_value(value: f64) -> Option<Value> {
    Number::from_f64(value).map(Value::Number)
}

fn option_number_value(value: Option<f64>) -> Value {
    value.and_then(number_value).unwrap_or(Value::Null)
}

fn previous_number(previous: Option<&Map<String, Value>>, key: &str) -> Option<f64> {
    previous.and_then(|value| read_number(value, &[key]))
}

fn previous_bool(previous: Option<&Map<String, Value>>, key: &str) -> Option<bool> {
    previous.and_then(|value| read_bool(value, &[key]))
}

fn previous_value(previous: Option<&Map<String, Value>>, key: &str) -> Option<Value> {
    previous.and_then(|value| value.get(key)).cloned()
}

fn clamp_percent(value: f64) -> f64 {
    value.clamp(0.0, 100.0)
}

fn normalize_rate_limit_window(
    source: &Map<String, Value>,
    previous: Option<&Map<String, Value>>,
) -> Option<Value> {
    let direct_used = read_number(source, &["usedPercent", "used_percent"]);
    let remaining = read_number(
        source,
        &["remainingPercent", "remaining_percent", "remaining"],
    );
    let used_percent = if let Some(value) = direct_used {
        Some(clamp_percent(value))
    } else if let Some(value) = remaining {
        Some(clamp_percent(100.0 - value))
    } else {
        previous_number(previous, "usedPercent")
    }?;

    let mut output = Map::new();
    output.insert("usedPercent".to_string(), number_value(used_percent)?);
    output.insert(
        "windowDurationMins".to_string(),
        option_number_value(
            read_number(source, &["windowDurationMins", "window_duration_mins"])
                .or_else(|| previous_number(previous, "windowDurationMins")),
        ),
    );
    output.insert(
        "resetsAt".to_string(),
        option_number_value(
            read_number(source, &["resetsAt", "resets_at"])
                .or_else(|| previous_number(previous, "resetsAt")),
        ),
    );

    Some(Value::Object(output))
}

fn normalize_credits_snapshot(
    source: &Map<String, Value>,
    previous: Option<&Map<String, Value>>,
) -> Value {
    let balance = match source.get("balance") {
        Some(Value::String(value)) => Value::String(value.clone()),
        Some(Value::Null) => Value::Null,
        _ => previous_value(previous, "balance").unwrap_or(Value::Null),
    };

    let mut output = Map::new();
    output.insert(
        "hasCredits".to_string(),
        Value::Bool(
            read_bool(source, &["hasCredits", "has_credits"])
                .or_else(|| previous_bool(previous, "hasCredits"))
                .unwrap_or(false),
        ),
    );
    output.insert(
        "unlimited".to_string(),
        Value::Bool(
            read_bool(source, &["unlimited"])
                .or_else(|| previous_bool(previous, "unlimited"))
                .unwrap_or(false),
        ),
    );
    output.insert("balance".to_string(), balance);
    Value::Object(output)
}

pub(crate) fn normalize_rate_limits_snapshot(
    previous: Option<&Value>,
    incoming: &Value,
) -> Option<Value> {
    let raw = incoming.as_object()?;
    let previous = previous.and_then(Value::as_object);
    let previous_primary = previous
        .and_then(|value| value.get("primary"))
        .and_then(Value::as_object);
    let previous_secondary = previous
        .and_then(|value| value.get("secondary"))
        .and_then(Value::as_object);
    let previous_credits = previous
        .and_then(|value| value.get("credits"))
        .and_then(Value::as_object);

    let primary = if has_key(raw, &["primary"]) {
        match raw.get("primary") {
            Some(Value::Null) => Value::Null,
            Some(Value::Object(value)) => {
                normalize_rate_limit_window(value, previous_primary).unwrap_or(Value::Null)
            }
            _ => previous_value(previous, "primary").unwrap_or(Value::Null),
        }
    } else {
        previous_value(previous, "primary").unwrap_or(Value::Null)
    };

    let secondary = if has_key(raw, &["secondary"]) {
        match raw.get("secondary") {
            Some(Value::Null) => Value::Null,
            Some(Value::Object(value)) => {
                normalize_rate_limit_window(value, previous_secondary).unwrap_or(Value::Null)
            }
            _ => previous_value(previous, "secondary").unwrap_or(Value::Null),
        }
    } else {
        previous_value(previous, "secondary").unwrap_or(Value::Null)
    };

    let credits = if has_key(raw, &["credits"]) {
        match raw.get("credits") {
            Some(Value::Null) => Value::Null,
            Some(Value::Object(value)) => normalize_credits_snapshot(value, previous_credits),
            _ => previous_value(previous, "credits").unwrap_or(Value::Null),
        }
    } else {
        previous_value(previous, "credits").unwrap_or(Value::Null)
    };

    let has_plan_type_key = has_key(raw, &["planType", "plan_type"]);
    let plan_type = raw
        .get("planType")
        .or_else(|| raw.get("plan_type"))
        .and_then(Value::as_str)
        .map(|value| Value::String(value.to_string()))
        .or_else(|| {
            if has_plan_type_key {
                Some(Value::Null)
            } else {
                previous_value(previous, "planType")
            }
        })
        .unwrap_or(Value::Null);

    let mut output = Map::new();
    output.insert("primary".to_string(), primary);
    output.insert("secondary".to_string(), secondary);
    output.insert("credits".to_string(), credits);
    output.insert("planType".to_string(), plan_type);
    Some(Value::Object(output))
}

#[cfg(test)]
mod tests {
    use super::normalize_rate_limits_snapshot;
    use serde_json::json;

    #[test]
    fn preserves_previous_usage_when_incoming_payload_omits_usage_percent() {
        let previous = json!({
            "primary": {
                "usedPercent": 22,
                "windowDurationMins": 60,
                "resetsAt": 1700000000
            },
            "secondary": {
                "usedPercent": 64,
                "windowDurationMins": 10080,
                "resetsAt": 1700000500
            },
            "credits": {
                "hasCredits": true,
                "unlimited": false,
                "balance": "120"
            },
            "planType": "pro"
        });

        let normalized = normalize_rate_limits_snapshot(
            Some(&previous),
            &json!({
                "primary": { "resets_at": 1700000777 },
                "secondary": {},
                "credits": { "balance": "110" }
            }),
        )
        .expect("normalized snapshot");

        assert_eq!(
            normalized,
            json!({
                "primary": {
                    "usedPercent": 22,
                    "windowDurationMins": 60,
                    "resetsAt": 1700000777
                },
                "secondary": {
                    "usedPercent": 64,
                    "windowDurationMins": 10080,
                    "resetsAt": 1700000500
                },
                "credits": {
                    "hasCredits": true,
                    "unlimited": false,
                    "balance": "110"
                },
                "planType": "pro"
            })
        );
    }

    #[test]
    fn does_not_fabricate_usage_percent_when_none_exists() {
        let normalized = normalize_rate_limits_snapshot(
            None,
            &json!({
                "primary": { "resets_at": 1700000999 }
            }),
        )
        .expect("normalized snapshot");

        assert_eq!(
            normalized,
            json!({
                "primary": null,
                "secondary": null,
                "credits": null,
                "planType": null
            })
        );
    }

    #[test]
    fn normalizes_remaining_style_percent_fields() {
        let normalized = normalize_rate_limits_snapshot(
            None,
            &json!({
                "primary": {
                    "remaining_percent": 20,
                    "window_duration_mins": 60
                },
                "secondary": {
                    "remainingPercent": "40",
                    "windowDurationMins": 10080
                }
            }),
        )
        .expect("normalized snapshot");

        assert_eq!(
            normalized,
            json!({
                "primary": {
                    "usedPercent": 80,
                    "windowDurationMins": 60,
                    "resetsAt": null
                },
                "secondary": {
                    "usedPercent": 60,
                    "windowDurationMins": 10080,
                    "resetsAt": null
                },
                "credits": null,
                "planType": null
            })
        );
    }
}

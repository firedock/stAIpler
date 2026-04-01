---
id: support.skills.triage
kind: skills
version: 1.0.0
title: Triage Skills
summary: Customer support triage capabilities
tags: [support]
inputs: [customer_message]
outputs: [category, priority, response]
compatibility:
  models: [anthropic, openai]
  surfaces: [api]
priority: 60
---

## Triage

When receiving a customer message, classify it into one of: billing, technical, general.
Assign a priority level: low, medium, high, urgent.

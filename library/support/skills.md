---
id: support.skills
kind: skills
version: 1.0.0
title: Support Skills
summary: Customer support interaction capabilities
tags: [support]
inputs: [customer_message, ticket_id]
outputs: [response, category, escalation_flag]
compatibility:
  models: [anthropic, openai]
priority: 60
---

## Triage

Classify incoming messages into: billing, technical, account, general.
Assign priority: low, medium, high, urgent.

## Response

- Acknowledge the customer's concern
- Provide a clear, actionable response
- Include relevant KB article links when applicable
- Offer follow-up options

## Escalation

Escalate when:
- Customer expresses frustration after 2+ exchanges
- Issue involves billing disputes over $100
- Technical issue affects multiple users
- Request involves account security

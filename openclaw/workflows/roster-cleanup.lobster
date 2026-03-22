name: roster-cleanup
steps:
  - id: audit
    run: openclaw.invoke --tool yahoo_roster_health_check
  - id: plan
    pipeline: >
      llm.invoke --prompt "Based on this roster audit, identify: 1) Players to
      activate from IL, 2) Players to drop, 3) Lineup slot changes needed.
      Return JSON action plan."
    stdin: $audit.stdout
  - id: approve
    approval: "Make these roster changes?"
    stdin: $plan.json
  - id: execute
    run: openclaw.invoke --tool yahoo_swap --args '${plan.json}'
    when: $approve.approved

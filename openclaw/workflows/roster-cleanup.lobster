name: roster-cleanup
steps:
  - id: audit
    run: openclaw.invoke --tool yahoo_roster_health_check
  - id: monitor
    run: openclaw.invoke --tool yahoo_roster_monitor
  - id: plan
    pipeline: >
      llm.invoke --prompt "Based on the roster audit and monitor alerts, build
      a prioritized action plan. For each action, use intelligence context:
      1) Players to activate from IL — check injury_severity and latest headline
      2) Players to drop — are they DEALBREAKER flagged, in the minors, or bust candidates?
      3) Lineup slot changes — factor in hot/cold streaks and BvP matchup data
      4) IL stash candidates — any trending FA with high upside?
      Return JSON action plan sorted by urgency."
    stdin: $audit.stdout $monitor.stdout
  - id: approve
    approval: "Make these roster changes?"
    stdin: $plan.json
  - id: execute
    run: openclaw.invoke --tool yahoo_swap --args '${plan.json}'
    when: $approve.approved

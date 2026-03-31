name: morning-routine
steps:
  - id: brief
    run: openclaw.invoke --tool yahoo_morning_briefing
  - id: monitor
    run: openclaw.invoke --tool yahoo_roster_monitor
  - id: lineup
    run: openclaw.invoke --tool yahoo_auto_lineup
  - id: summary
    pipeline: >
      llm.invoke --prompt "Combine the morning briefing, roster monitor alerts,
      and lineup optimization into a concise actionable summary. Lead with any
      critical alerts (injuries, dealbreakers, DFA'd players). Then cover today's
      key matchup highlights (BvP advantages, weather risks). End with lineup
      changes made and why. Keep it under 5 sentences."
    stdin: $brief.stdout $monitor.stdout $lineup.stdout

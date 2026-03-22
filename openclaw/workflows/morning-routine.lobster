name: morning-routine
steps:
  - id: brief
    run: openclaw.invoke --tool yahoo_morning_briefing
  - id: lineup
    run: openclaw.invoke --tool yahoo_auto_lineup
  - id: summary
    pipeline: >
      llm.invoke --prompt "Combine the morning briefing and lineup optimization
      results into a concise 3-4 sentence summary. Lead with the most urgent item."
    stdin: $brief.stdout

name: waiver-claim
args:
  position:
    default: ""
steps:
  - id: analyze
    run: openclaw.invoke --tool yahoo_waiver_recommendations
  - id: rank
    pipeline: >
      llm.invoke --prompt "Based on this waiver analysis, rank the top 3 targets.
      For each, explain: (1) their Statcast quality tier, (2) hot/cold streak status,
      (3) depth chart role (starter/backup), (4) which weak categories they fill,
      (5) any context warnings or red flags from news.
      Skip any players with DEALBREAKER flags or availability=minors/released.
      Return JSON with player name, bid amount, drop candidate, and reasoning."
    stdin: $analyze.stdout
  - id: approve
    approval: "Submit these waiver claims?"
    stdin: $rank.json
  - id: execute
    run: openclaw.invoke --tool yahoo_waiver_claim --args '${rank.json}'
    when: $approve.approved

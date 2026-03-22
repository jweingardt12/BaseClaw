name: waiver-claim
args:
  position:
    default: ""
steps:
  - id: analyze
    run: openclaw.invoke --tool yahoo_waiver_deadline_prep
  - id: rank
    pipeline: >
      llm.invoke --prompt "Based on this waiver analysis, rank the top 3 targets
      with recommended FAAB bids. Return JSON with player name, bid amount,
      drop candidate, and brief reasoning."
    stdin: $analyze.stdout
  - id: approve
    approval: "Submit these waiver claims?"
    stdin: $rank.json
  - id: execute
    run: openclaw.invoke --tool yahoo_waiver_claim --args '${rank.json}'
    when: $approve.approved

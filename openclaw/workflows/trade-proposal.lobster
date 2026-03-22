name: trade-proposal
args:
  target_player:
    default: ""
steps:
  - id: scan
    run: openclaw.invoke --tool yahoo_trade_pipeline
  - id: evaluate
    pipeline: >
      llm.invoke --prompt "Evaluate the top trade proposals. For each, show
      z-score impact, category shifts, and grade. Recommend the best deal.
      Return JSON."
    stdin: $scan.stdout
  - id: approve
    approval: "Send this trade proposal?"
    stdin: $evaluate.json
  - id: send
    run: openclaw.invoke --tool yahoo_propose_trade --args '${evaluate.json}'
    when: $approve.approved

name: trade-proposal
args:
  target_player:
    default: ""
steps:
  - id: scan
    run: openclaw.invoke --tool yahoo_trade_pipeline
  - id: evaluate
    pipeline: >
      llm.invoke --prompt "Evaluate the top trade proposals. For each, show:
      (1) z-score impact with context adjustments (injuries, regression, momentum),
      (2) category shifts — which categories improve vs decline,
      (3) trade grade from both sides,
      (4) any DEALBREAKER or WARNING flags on players involved,
      (5) depth chart position of incoming players — will they actually start?
      Reject any proposal involving a player with a DEALBREAKER flag.
      Recommend the best deal with a clear one-sentence justification.
      Return JSON."
    stdin: $scan.stdout
  - id: approve
    approval: "Send this trade proposal?"
    stdin: $evaluate.json
  - id: send
    run: openclaw.invoke --tool yahoo_propose_trade --args '${evaluate.json}'
    when: $approve.approved

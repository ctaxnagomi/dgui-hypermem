# Email draft — Cloudflare Monetization Gateway feedback

**To:** monetization-gateway-feedback@cloudflare.com
**From:** wan.mohd.azizi.seggaf@gmail.com
**Subject:** DeckerGUI — first public MCP (dgui-hypermem) with JEV continuous selective learning: Monetization Gateway interest & feedback

---

Hi Cloudflare team,

I'm writing from **DeckerGUI** (DeckerGUI Unified Agentic Integrated Ecosystem) to
introduce our first public MCP server — **dgui-hypermem** — and to share interest
and feedback on the Monetization Gateway.

**dgui-hypermem** is a hybrid long-term memory MCP server for AI agents, built
entirely on Cloudflare Workers and live at **https://dgui-hmem.deckergui.my**
(remote MCP over Streamable HTTP, OAuth 2.1 with PKCE, opt-in consent on our own
host). A DeckerGUI project; more agent-facing services will follow, but this is
the first public surface.

What makes it interesting:

- **Memory that reasons.** Retrieval fuses Vectorize ANN with D1 full-text
  (FTS5) candidates, then a **JEV reasoning layer** (Choice / Noul / Score —
  TypeSafe AI's "system one" runtime, with a Workers AI fallback) re-ranks
  results and curates what gets remembered: assigning type, salience and
  durability, and superseding near-duplicate or contradicted entries.
- **Continuous selective learning.** Every JEV decision
  (analyze / rerank / supersede) is logged and flushed to a public Hugging Face
  dataset (`ctaxnagomi/DGUI_HYPERMEM-JEV`) — a labelled training corpus of the
  system's own reasoning that grows as it is used.
- **Prognostic generation, 4–5 steps ahead per context.** The layer is designed
  to maintain a short ranked set of expectations about what comes next in a
  working context, so agents get the memories and constraints most likely to be
  *needed* rather than merely textually similar ones — each expectation recorded
  before the fact and scored against the observed outcome, turning every cycle
  into supervised training signal.
- **First-class monetization.** Per-token plan ladder (Free / Median / Pro /
  Enterprise) plus pay-as-you-go at $0.002/request, metered on a 30-day window
  and settled through Stripe Checkout; enterprise and self-hosted deployments
  supported.

Stack: Cloudflare Workers (ES modules, `nodejs_compat`), D1, Vectorize, Workers
AI, and the JEV backend (TypeSafe AI) for the reasoning layer. Docs:
**https://dgui-hmem.deckergui.my/docs**.

**Why I'm writing to this address:** dgui-hypermem is exactly the class of
resource the Monetization Gateway targets — a paid utility that AI agents
consume. Today payment is initiated by a human developer through Stripe
Checkout before the agent can use the endpoint. A gateway that lets the agent
itself authorize and settle payment mid-request (x402-style authorization in
the request, settled on-chain) would remove that friction and let us meter
agent-driven usage directly. We would be keen to join the closed beta, and we
are happy to share usage, conversion and billing data as feedback on the
program.

Thanks,
Wan Mohd Azizi
DeckerGUI · wan.mohd.azizi.seggaf@gmail.com
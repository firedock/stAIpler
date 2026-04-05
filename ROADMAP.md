# stAIpler Roadmap

## Launch — Monday April 7, 2026

### Must-Have for Launch (this weekend)

**Polish & Fix**
- [ ] Landing page: update GitHub URL to firedock/stAIpler, verify all links
- [ ] Deploy web app to Vercel (app.staipler.com or staipler.com)
- [ ] Deploy landing page (staipler.com)
- [ ] Test full user flow end-to-end: signup → create project → connect GitHub → see layers → chat
- [ ] Fix any auth edge cases (email confirmation, GitHub OAuth redirect)
- [ ] Add error boundaries and loading states throughout dashboard
- [ ] Mobile responsiveness pass on landing page + dashboard

**Critical Features**
- [ ] Publish @staipler/core and @staipler/cli to npm (npx staipler works)
- [ ] Layer relationship visualization — show how layers connect (identity → style, constraints → skills)
- [ ] "Optimize with AI" button on dashboard — generate missing layers from the web UI (not just CLI)
- [ ] Scan report improvements — make files clickable, show which source each came from

**Content & Messaging**
- [ ] README.md rewrite — focused on "Subject Expert" narrative
- [ ] Add "Subject Expert" branding throughout (landing page, dashboard, onboarding)
- [ ] Social sharing meta tags (og:image, og:description)
- [ ] Write launch tweet / LinkedIn post copy

---

### Phase 2 — Week of April 7-14 (Post-Launch)

**Agent Recipes Marketplace**
- [ ] Pre-built stacks: Customer Support, Code Reviewer, Sales Assistant, DevOps, Technical Writer
- [ ] One-click import from marketplace into your project
- [ ] Community-contributed stacks

**Scheduling Loop**
- [ ] Automated re-scans on cron (daily/weekly)
- [ ] Email/Slack notifications when empowerment score drops
- [ ] Drift detection — alert when instruction files change externally

**Data Source Integrations**
- [ ] NoteDrawer OAuth flow (first-party)
- [ ] Notion API integration
- [ ] Google Docs API integration

---

### Phase 3 — April 14-28

**Cross-Artifact Relationships**
- [ ] Visual dependency graph — how layers relate (identity informs style, policies override constraints)
- [ ] Impact analysis — "if you change this layer, these 3 other layers may be affected"
- [ ] Conflict detection between layers

**Advanced Chat**
- [ ] Conversation history persistence
- [ ] Multi-turn eval scoring
- [ ] "Suggest improvements" — agent recommends layer changes based on chat performance

**Python Distribution**
- [ ] pip install staipler
- [ ] Python SDK wrapping @staipler/core

---

### Phase 4 — May+

**Team Features (Paid)**
- [ ] Team workspaces with shared projects
- [ ] Role-based access (admin, editor, viewer)
- [ ] Audit log of all context changes

**CI/CD Integration**
- [ ] GitHub Action: run staipler validate on PR
- [ ] Pre-commit hook: ensure instruction files are valid
- [ ] Badge: "Empowerment Score: 95/100" for README

**Enterprise**
- [ ] SSO / SAML
- [ ] Custom model endpoints
- [ ] On-premise deployment option

# PROOF-OF-WORK.md

What the "Proof of work" section on `/work` needs before it goes live, and how to put it there.

The scaffold already exists, commented out, at the bottom of the day-to-day content in `work/index.html` (search for `PLACEHOLDER — "Proof of work"`). Nothing on the live site promises proof right now, which is deliberate. Read this before uncommenting it.

---

## 1. Why the section is empty

The page used to have a heading that said **Proof of work** followed immediately by a list of SaaS logos. Anyone can list those logos. Promising proof and delivering a shopping list is worse than having no section at all, because the page itself set the expectation and then broke it in the next line.

So the heading came off and the tools moved to the bottom as a quiet grey line. The heading comes back only when there is something behind it.

## 2. What counts as proof

One rule: **a stranger can check it without asking you for anything.**

That means a public artifact — a repo they can open, code they can run, a dataset they can inspect. Not a description of work. Not a screenshot of a dashboard. Not a claim about a result.

| Counts | Doesn't count |
|---|---|
| Public repo with a README and runnable code | "I built an outbound engine at Ollive" |
| A dataset someone can download and audit | A screenshot of a dashboard |
| A scoring model with its rubric written down | "Reply rates went up" |
| A writeup of a method with the code beside it | A tool logo |

## 3. The artifact this section is waiting on

Per the brief, expected around **23 Aug 2026**:

- An **evidence-linked dataset of companies shipping AI agents** — every row backed by a citation a reader can click and verify.
- An **ICP scorer** on top of it.

The angle that makes it worth publishing: you model the AI-tooling market from the outside while selling AI into a completely different industry, so you know that market as a researcher rather than as one of its vendors. Say that once, in the problem block. Don't repeat it.

## 4. Before it can be linked

Work through this list first. A repo that fails any of these is worse than no link, because the link is an invitation to look closely.

1. **Repo is public** and the URL is stable.
2. **README explains what it is in the first two sentences** — assume the reader is a hiring manager with forty seconds, not an engineer who will read the source.
3. **It runs.** Fresh clone, documented setup, one command. Test it in a clean directory before you link it.
4. **A license file exists.** MIT is fine.
5. **No Ollive anything.** No customer names, no account lists, no ICP internals, no prompts, no exported data. If the code touches an Ollive system, it does not go in this repo. Rebuild the piece you want to show against public data.
6. **No credentials in the history.** Check every commit, not just the current tree — `git log -p` and grep for keys.
7. **Every dataset row has a working citation link.** "Evidence-linked" is the whole claim. One dead link undoes it.

## 5. What to write

Each entry gets the same three blocks, in this order. Keep every block to two or three sentences.

**Problem** — what was actually hard or unknown. State it as a question a reader would also find interesting. No setup, no scene-setting.

**What I built** — the system, described as a system. Say what it does and how it is put together. Name a language or a model API only if it carries real information; a list of tools belongs at the bottom of the page, not here.

**What happened** — what the thing produced, what you learned, what turned out to be wrong. This is where the honesty of the rest of the site has to hold. "The scorer disagreed with my own shortlist on a third of the accounts and the scorer was right more often than I was" is worth more than any number.

### Filled example, for shape only

> **Problem** — There is no public list of which companies are actually shipping AI agents, as opposed to announcing them. Vendor lists are marketing and analyst lists are behind paywalls.
>
> **What I built** — A pipeline that sources candidate companies, pulls public evidence for each one, and stores the citation alongside the claim so every row can be checked. A scoring pass then ranks them against a written ICP rubric.
>
> **What happened** — About a third of the companies that announce agents have nothing shippable behind the announcement, which is only visible once you require a citation per row. [Then whatever the honest finding turns out to be.]

Replace all of that with the real thing. Do not ship the example.

## 6. Rules that don't bend

- **No performance metrics anywhere.** No reply rates, no pipeline numbers, no multiples. Those belong to Ollive and are not yours to publish. Describe scope and architecture instead — for engineering roles that reads better anyway.
- **No Ollive customer, account, prompt, or ICP internal.** Naming the industry ("liability insurance") is fine. Naming carriers, brokers, or buyers is not.
- **Systems lead, tools follow.** "I build enrichment pipelines with evidence-linked provenance", not "I use Clay and Apollo". The tool list appears exactly once on the site, at the bottom of `/work`, and this section must not become a second copy of it.
- **Don't reintroduce a cut tool** in prose: Zapier, n8n, Airtable, FullEnrich, Granola, Git, Linear, Figma.

## 7. Putting it on the page

1. Open `work/index.html`. Find the comment block starting `PLACEHOLDER — "Proof of work"`.
2. Delete the two comment marker lines (the `<!-- ... -->` wrapper) so the markup inside becomes live.
3. Replace `PROJECT NAME` in the `<h2>` with the artifact's name.
4. Replace the three `<p>...</p>` bodies with the problem / what I built / what happened copy.
5. Replace `REPO URL` in the button `href` with the repo link. Keep the button text short — "See the code".
6. **Leave it where it is.** The order on the page matters: What I build → Before this → **Proof of work** → the tool stack, quiet, last. Proof goes above the tools, never below.
7. If there is more than one entry, repeat the whole `<section>` rather than stretching one section to hold two projects. Give each its own `<h2>`.

Nothing new is needed in `styles.css`. The scaffold reuses `.section`, `.section-head`, `.def-rows`, `.def-row` and `.btn`, which are already styled.

## 8. Verify before pushing

```bash
python3 -m http.server 8747          # from the repo root
```

Then, in the browser or via the browse skill:

- The section renders where you expect, above the tool stack.
- The repo link opens the right page and is not a 404.
- Scroll reveal fires on the new section (it inherits `data-reveal`).
- With reduced motion on, the section is visible rather than blank.
- Mobile at 375px wide: the `def-row` label column collapses and nothing overflows.

## 9. Keep the other surfaces in step

Once the section is live, four surfaces have to agree — the site, LinkedIn, the resume, and whatever the Ollive cofounder has confirmed in writing.

- Add the same three-block story to `COPY.md` so the draft copy stops lying about what's on the page.
- Add one line to the resume's experience or projects section with the repo URL.
- Post it once on LinkedIn and once on X. The artifact only works as proof if someone finds it.
- Update the meta description on `/work` if the page's headline claim changes.

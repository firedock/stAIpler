# Getting Started — A Complete Walkthrough

## The Problem You Might Not Know You Have

When you ask an AI assistant (like Claude, ChatGPT, or the AI built into your code editor) to help with your project, it starts every conversation completely blind.

It has no idea:
- What your project does
- Who uses it
- What rules you follow
- What you've already built
- What you absolutely don't want it to do

So it guesses. Sometimes the guesses are okay. Often they're wrong in ways you don't notice until it's too late. The AI suggests something that breaks your conventions, violates your rules, or just misses the point entirely — and you blame the AI for being "dumb."

**The AI isn't dumb. It's just working without instructions.**

Imagine hiring a new employee and never telling them what your company does, what your rules are, or what their job is — then getting frustrated when they do the wrong thing. That's what happens every time you start a new AI conversation.

---

## What stAIpler Does

stAIpler is a tool that writes the "employee handbook" for your AI assistant automatically.

It reads your project, figures out what's missing, and generates a set of instruction files that teach your AI:

- **Who it's supposed to be** (its role on your project)
- **What rules it must follow** (your non-negotiables)
- **What your project actually is** (the domain, the conventions, the business)
- **How it should communicate with you** (tone, style, when to push back)

Once these files exist, every AI tool you use — Claude, Cursor, Copilot, ChatGPT, Gemini — automatically reads them and starts every conversation already knowing your project.

You stop repeating yourself. The AI stops guessing. The work gets better.

---

## What You'll Need

**One thing:** an account with Claude (the AI made by Anthropic). If you already use Claude.ai, you're set.

- Go to https://claude.com/download
- Install the app
- Sign in

That's it. No coding knowledge required. The whole walkthrough below takes about 5 minutes.

---

## Step 1: Open Terminal

On a Mac:
- Press **⌘ (Command) + Space**
- Type `Terminal`
- Press **Enter**

A window opens with a blinking cursor. This is where you type commands. Don't worry — we'll only type a few.

---

## Step 2: Point Terminal at Your Project

Find your project folder in Finder (the folder with your code, docs, or files in it).

In Terminal, type `cd ` (the letters `cd` followed by one space — don't press Enter yet).

Then drag your project folder from Finder onto the Terminal window. You'll see something like:

```
cd /Users/yourname/Documents/my-project
```

Press **Enter**. Terminal is now "inside" your project.

---

## Step 3: Run the First Command

Type this exactly, then press **Enter**:

```
npx staipler init
```

The first time you run this, your computer will download stAIpler automatically. It takes about 30 seconds.

When it finishes, you'll see a report like this:

```
  stAIpler init — setting up my-project

  Scanning for instruction files...
  Found 2 instruction files

  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0/100 (F)  Empowerment Score

  Layer coverage:
    ✗ constraints    Hard limits and non-negotiables
    ✗ context        Domain knowledge and business rules
    ✗ goals          Success criteria and priorities
    ✗ identity       Role, persona, and character
    ✗ skills         Workflows and decision trees
    ✗ style          Tone, formatting, response shape
    ... (and 6 more)
```

### What This Means (In Plain English)

- **"Empowerment Score: 0/100 (F)"** — This is like a grade for how well your AI understands your project. F means it knows almost nothing. Don't take it personally — every project starts here.

- **The red ✗ marks** — These are 12 categories of things your AI should know. Each missing category is something the AI is guessing about every time you ask it for help.

- **"Constraints, Context, Goals, Identity..."** — These are the categories. Think of them like chapters in an employee handbook. Right now, every chapter is blank.

---

## Step 4: Let AI Fill In the Missing Pieces

Type this and press **Enter**:

```
npx staipler optimize
```

This is where the magic happens. stAIpler uses AI to read your project — your README, your code structure, your documentation — and writes all the missing instruction files automatically.

You'll see messages like:

```
  Generating identity layer... done
  Generating constraints layer... done
  Generating context layer... done
  Generating goals layer... done
  Generating skills layer... done
  Generating style layer... done
```

This takes about a minute. The AI is reading your project and writing 6 to 8 instruction files that are specific to YOUR project. Not generic templates — actual custom instructions based on what it found.

---

## Step 5: See the Difference

Run the first command again:

```
npx staipler init
```

Now your report looks completely different:

```
  ████████████████████░░░░░░░░░  82/100 (B)  Empowerment Score

  Layer coverage:
    ✓ constraints    Hard limits and non-negotiables      CONSTRAINTS.md
    ✓ context        Domain knowledge and business rules  CONTEXT.md
    ✓ goals          Success criteria and priorities      GOALS.md
    ✓ identity       Role, persona, and character         IDENTITY.md
    ✓ skills         Workflows and decision trees         SKILLS.md
    ✓ style          Tone, formatting, response shape     STYLE.md
```

### What Changed

- **Score jumped from 0 to 82 (F to B)** — Your AI now has solid context about your project.
- **Red ✗ turned into green ✓** — Every category that was missing now has an actual file.
- **File names next to each** — Those are the instruction files the AI just wrote for your project.

---

## Step 6: Read What the AI Wrote About Your Project

Open your project folder in Finder. You'll find a new folder called `library/optimized/` with files like:

- `IDENTITY.md`
- `CONSTRAINTS.md`
- `CONTEXT.md`
- `GOALS.md`
- `SKILLS.md`
- `STYLE.md`

Open any of them in TextEdit (or any text editor). They're written in plain English. You can read them like any document.

**This is important:** stAIpler doesn't hide anything. Every piece of context your AI will use is a file you can read, edit, or delete. Nothing is locked inside a black box.

For example, `STYLE.md` might contain something like:

> ## Communication
> - Push back when you disagree. Don't default to agreement.
> - If there's a better approach, state it directly with reasoning.
> - Ask clarifying questions rather than guessing intent.

Most people never think to write instructions like this — but they're exactly the kind of thing that makes an AI useful instead of frustrating.

---

## Step 7: Use It

That's actually it. Your project now has instruction files, and every AI tool that works in your project folder will automatically read them:

- **Claude Code** reads `CLAUDE.md`
- **Cursor** reads `.cursorrules`
- **GitHub Copilot** reads `copilot-instructions.md`
- **Gemini CLI** reads `GEMINI.md`

When you start a new chat or a new coding session, your AI assistant will already know your project. You don't have to explain it again.

---

## Optional: See It Visually

If you prefer a visual interface, go to **https://staipler.com**, sign in, and create a project. Upload your files or connect a GitHub repository.

You'll see a **Memory Map** — a visual picture of everything your AI knows about your project:

- Colored dots for each piece of context, organized into 12 categories
- Lines connecting related pieces
- Missing categories shown as empty dashed circles
- Click any dot to see exactly what's in it

It's your AI's brain, visualized. You can see what it knows, what it's missing, and how everything connects.

There's also a **split-view chat** where you can ask the same question on both sides:
- **Left:** AI with no context (the old way)
- **Right:** AI with stAIpler instructions (the new way)

The difference is usually obvious immediately.

---

## Why This Matters

Most people who use AI assistants have had this experience:

- You explain your project at the start of a chat.
- The AI seems to get it.
- Three messages later, it's back to giving generic advice.
- You start a new chat tomorrow and have to explain everything again.

stAIpler fixes this in about 5 minutes per project. Once it's done, your AI tools stop starting from zero. Every new conversation begins with full context.

You'll notice the difference in the first five minutes of using it.

---

## Questions You Might Have

**Does this work with ChatGPT?**
Yes. stAIpler creates files that every major AI tool reads automatically.

**Do I need to re-run it?**
Usually no. The files stay. Re-run `optimize` only after big changes to your project.

**Will it mess up my project?**
No. stAIpler only creates files in a `library/optimized/` folder. It doesn't touch your existing code.

**Is it free?**
The command line tool is free. The web app is free for personal use.

**What if I don't like what the AI wrote?**
Open the files and edit them. They're just text. You're in control.

**Is my code uploaded somewhere?**
The command line tool runs entirely on your computer. Nothing leaves your machine unless you choose to use the web app.

---

## One Command to Remember

If you only remember one thing from this walkthrough, remember this:

```
npx staipler init
```

Run this in any project folder. It will tell you what your AI knows, what it's missing, and what to do next. Everything else flows from there.

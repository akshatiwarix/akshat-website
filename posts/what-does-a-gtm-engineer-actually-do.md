---
title: What Does a GTM Engineer Actually Do? My Mental Model After Trying to Become One
date: 2026-08-10
excerpt: GTM Engineering sits somewhere between sales, operations, data, and software. Here's the framework I use to understand it.
draft: false
---

For the longest time, I had no idea what a GTM Engineer actually did.

I kept seeing the title everywhere.

GTM Engineer. Growth Engineer. RevOps. Sales Engineer. Growth Ops. Sales Ops.

Some job descriptions made GTM Engineering sound like sales automation. Others made it sound like data engineering for revenue teams. And some basically wanted a software engineer who also understood how to sell.

The more I looked into it, the more confusing it became.

Things started making more sense only when I stopped trying to understand the role through job descriptions and started looking at the actual problems GTM teams were trying to solve.

Who should we sell to?

How do we know which companies are actually worth spending time on?

How do we research hundreds or thousands of accounts without doing everything manually?

How do we turn signals into actions?

How do we make outbound more relevant?

How do we connect all of this with the CRM?

And increasingly:

How do we use AI without turning the entire sales process into spam?

Once I started thinking about those problems, GTM Engineering clicked for me.

My current mental model is pretty simple:

> A GTM Engineer turns go-to-market ideas into systems that can actually run.

That is probably the easiest way I know to explain the role.

And the GTM Engineering loop looks like this:

Strategy → Systems → Execution → Data → Better Strategy

You just need to run the loop over and over again.

## So what does a GTM Engineer actually build?

This was the question that helped me understand the role the most.

A GTM Engineer might build things like:

- ICP scoring systems
- lead enrichment pipelines
- trigger-based prospecting systems
- personalised outbound workflows
- CRM automations
- sales-call summarisation workflows
- automated follow-up systems
- AI agents that assist the sales team

and many more things…

One project I find especially useful for understanding the role is an AI prospect research agent. And it is something that I have personally built at my work for my team.

At first, it sounds like an AI project.

But look at what actually has to happen.

You need to define the ICP.

You need company data.

You need enrichment.

You need to decide which signals matter.

You need a way of scoring accounts.

You need research from websites, LinkedIn, news, job postings or other sources.

You need rules for choosing the right buyer.

You need somewhere to store the information.

You probably need the output inside a CRM.

And eventually you need to measure whether any of that research actually helped sales.

That isn't purely engineering.

It isn't purely sales either.

It is building infrastructure around the sales process.

That's GTM Engineering.

A line I keep coming back to is:

> A GTM Engineer doesn't necessarily do the selling. They build the machine that makes selling more intelligent.

## My three-layer model for GTM Engineering

The easiest framework I've found is to think about GTM systems in three layers:

### 1. Data

First, you need to know who you are dealing with.

That includes things like:

- company data
- people data
- firmographics
- technographics
- job postings
- funding events
- hiring signals
- product usage
- website activity
- intent data
- CRM history

The question at this layer is:

**Who should we care about?**

Good GTM starts with good inputs.

If your data is bad, almost everything downstream becomes worse.

### 2. Logic

This is where the system decides what the data actually means.

Should this company qualify?

How strong is the fit?

Which persona should we contact?

Should the account go to sales right now?

Which signal is important enough to trigger outreach?

How should the messaging change based on company type?

This layer includes things like:

- segmentation
- ICP scoring
- qualification
- prioritisation
- routing
- personalisation rules
- campaign logic

The question here is:

**What should we do with what we know?**

This is probably the most underrated part of GTM Engineering.

You can have incredible tools and terrible logic.

Automation just helps you make the wrong decision faster.

### 3. Execution

Finally, something needs to happen.

That could mean:

- create a CRM record
- enrich a contact
- send data to Clay
- trigger an email sequence
- notify an AE
- generate account research
- create a task
- update a pipeline stage
- send information into Slack

This is where APIs, webhooks, scripts, workflow automation platforms, CRMs and AI agents come in.

The question becomes:

**How do we make the action happen reliably?**

So my current model is:

**Data → Logic → Execution**

Most GTM systems I've looked at can be broken down into those three layers.

## How is this different from RevOps, Sales Engineering or Growth Engineering?

This is where definitions get messy.

Especially at startups.

A RevOps person might absolutely build automations.

A growth engineer might work on acquisition systems.

A sales engineer might write code.

And a GTM Engineer at one company might look completely different from a GTM Engineer somewhere else.

But the distinction I currently use is this:

**SDRs** execute prospecting and conversations.

**RevOps** makes the overall revenue organization operate effectively.

**Sales Engineers** help customers understand and technically evaluate a product during the sales process.

**Growth Engineers** usually build product or engineering experiments that drive acquisition, activation or retention.

**GTM Engineers** build technical systems around how a company finds, understands, reaches and converts customers.

These boundaries are obviously not perfect.

And honestly, I don't think they need to be.

The interesting thing is the direction all of these roles are moving in.

Sales is becoming more technical.

Engineering tools are becoming easier to use.

And AI is making it possible for relatively small teams to build GTM systems that would have required much larger teams a few years ago.

## Why is GTM Engineering becoming a thing now?

I think a few trends are colliding.

Companies now have access to enormous amounts of commercial data.

Almost every major GTM tool has an API.

Workflow automation is easier than ever.

LLMs can process messy information extremely well.

And AI agents are starting to make multi-step workflows much more practical.

A lot of sales work historically involved humans moving information from one place to another.

Research this company.

Open LinkedIn.

Read their website.

Find the right person.

Copy information into the CRM.

Write a first draft.

Create a task.

Remind yourself to follow up.

None of those activities individually require particularly advanced reasoning.

But together they consume an enormous amount of time.

That doesn't mean AI suddenly replaces salespeople.

I think that framing is too simplistic.

What seems much more interesting is this:

> One salesperson with great GTM infrastructure can operate very differently from one without it.

The salesperson can spend less time collecting information and more time thinking.

Less time updating systems and more time talking to customers.

Less time researching random accounts and more time focusing on the right ones.

That is the shift I find interesting.

If you can take a GTM problem and turn it into logic.

Take that logic and turn it into a system.

And measure whether that system is actually improving anything.

The ultimate goal of creating revenue leverage can easily be reached.

## Where I'm at right now

I'm still figuring this role out.

My background started much closer to technology and data than sales.

Over time, I found myself becoming increasingly interested in startups, sales, growth and how companies actually get products into people's hands.

GTM Engineering feels like an interesting intersection of those worlds.

Right now I'm learning it by doing.

Breaking things.

Rebuilding them.

And slowly developing my own opinions about what actually works.

So I don't consider this post a definitive explanation of GTM Engineering.

It's my current mental model.

And I fully expect parts of it to change.

That's also one of the reasons I'm starting this blog.

Instead of waiting until I feel like an expert, I want to document what I'm building, what I'm learning and how my thinking changes over time.

If I do this properly, maybe a year from now I'll come back to this article and disagree with half of it.

I think that would be a good thing.

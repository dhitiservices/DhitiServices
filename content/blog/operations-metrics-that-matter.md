---
title: "Measure the work, not just the activity"
description: "Choose operational metrics that reveal usable output, waiting time, rework and ownership without turning reporting into another full-time job."
category: "Operations"
image: "why-choose.webp"
imageAlt: "A team reviewing operational work"
order: 8
date: "2026-09-21"
---

Operational metrics should help a team decide what to do next. If a report shows more activity but cannot explain whether the output was usable, the queue is healthier or customers are waiting less, it is probably answering the wrong question.

Start with a decision you need to make. Do you need more capacity, clearer instructions, better input data or faster approvals? Each question needs different evidence. Collecting every available number can make the discussion noisier without making the answer more reliable.

This guide proposes a compact reporting approach for a records, support or back-office workflow. The definitions are suggested starting points. Agree them with the people who own and use the process before treating the measures as contractual targets.

## Define the unit of work first

Decide what one completed item means. Is it a request, a record, a document, a customer conversation or a batch? If a request contains several records, make clear whether you count the request once or count each record separately.

Then define the finish line. An operator submitting an item for review is not necessarily the same event as a reviewer accepting it. A customer receiving an initial reply is not necessarily the same as the issue being resolved.

Use consistent names for these events. If the word “completed” means different things in different reports, people may argue about performance when the underlying problem is a definition mismatch. Fix the definition before trying to explain the trend.

## Separate throughput from accepted output

Throughput can describe how many items moved through a stage. Accepted output describes work that met the agreed acceptance criteria. Reporting both can show whether increased processing is accompanied by increased usable delivery.

For an illustrative example, imagine 120 records were submitted for review and 100 were accepted without changes. That does not automatically mean 20 records were permanently unusable. They may need correction, additional information or a different decision. Keep those outcomes separate.

Do not present a sample’s acceptance rate as a precise measure of every item unless your method supports that interpretation. State how many items were reviewed, how they were selected and what the review covered. A percentage without that context can look more certain than the evidence allows.

## Split active work from waiting

Define the starting event for turnaround. You might measure from request receipt, from receipt of complete information or from assignment to an operator. Each can be useful, but they answer different questions.

Where practical, separate time spent waiting for information or approval from time in active processing. If an item sits for several days awaiting a decision, increasing typing speed will not address the main delay.

Show the age of unresolved work, not just the average completion time of finished work. Otherwise, the most difficult items can disappear from the headline because they have not yet reached completion. A simple view of the oldest open items can make an overlooked problem visible.

## Make rework explainable

Count returned items, but also record why they were returned. Useful categories might include incorrect entry, unclear instructions, incomplete source data, changed requirements or reviewer disagreement. Keep the list small enough that people can use it consistently.

Avoid categories that assign blame before the issue is understood. “Operator error” may be accurate in some cases, but it should not become the default label for every returned item. Inspect the rule and the evidence.

The [Government Data Quality Framework](https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework) recommends addressing quality issues at source rather than only treating symptoms. For operational reporting, apply that idea by linking a recurring rework category to the process change that could prevent it.

## Treat critical events separately

Some problems should not be averaged away. An unauthorised disclosure or a wrong high-impact action may require immediate review even when the general quality score looks strong. Agree these categories with the appropriate business and risk owners.

Record what happened, what was affected, what was contained and what decision is required. Keep access to incident details appropriate to the sensitivity of the information. A general team dashboard does not need to expose private data to everyone.

Do not equate a low incident count with proof that all risks are controlled. The team also needs a reliable way to recognise and report incidents. Review whether people understand the escalation path and whether concerns can be raised without being hidden to protect a target.

## Pair numbers that balance each other

Avoid evaluating speed entirely separately from quality. If you ask for faster handling, also review returned work and the completeness of records. If you ask for fewer escalations, check whether uncertain items are being resolved correctly or simply left unreported.

Choose pairings that reflect the likely trade-off in your process. Turnaround and accepted output may be one pair. Volume and oldest-open-item age may be another. The purpose is not to create a complex score, but to stop one target from encouraging an unwanted shortcut.

Explain the desired behaviour when introducing a measure. Tell the team that raising a well-documented blocker is useful, even if it temporarily increases the exception count. Otherwise, the report may reward apparent smoothness rather than honest visibility.

## Use a weekly review to make decisions

Keep the review focused on a few questions. What changed? Which items need a decision? Which recurring issue deserves a process improvement? Did the action agreed last time actually happen?

The [ASQ Plan-Do-Check-Act model](https://asq.org/quality-resources/pdca-cycle) connects planned changes, small tests, review and subsequent action. Your metric review should support that cycle instead of ending when everyone has seen the chart.

For each action, name an owner and the evidence that will show completion. “Improve accuracy” is not an action with a clear finish line. “Clarify the date-field rule, retrain on three examples and inspect the next reviewed batch” gives the team something observable to do.

## Build a metric dictionary you can maintain

Document each measure in a short, repeatable format:

- **Question:** What decision should this measure inform?
- **Unit:** What exactly is being counted or timed?
- **Start and finish:** Which events define the measurement?
- **Formula:** What is included in the numerator and denominator?
- **Exclusions:** Which work is left out and why?
- **Source:** Where does the underlying record come from?
- **Owner:** Who checks that the data and definition remain valid?
- **Response:** What investigation or action follows an unusual result?

Begin with the measures you can collect reliably. If a useful metric requires manual reconstruction every week, consider improving the workflow’s event records before adding it to a permanent scorecard.

Review the measures when the process changes. A new request type, approval stage or system can make old comparisons misleading. Annotate the change rather than quietly joining incompatible periods into one trend.

The best operational dashboard is not the fullest one. It is the one that helps the team distinguish a capacity problem from a clarity problem and act accordingly.

Use the [pilot guide](../operations-pilot-first-30-days/) to test these measures on a limited workflow. For better underlying records, read the [data quality checklist](../data-entry-quality-checks/).

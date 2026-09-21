---
title: "When records disagree, build a better exception queue"
description: "A practical approach to reconciliation and exception management: preserve evidence, define matching rules and make unresolved items visible."
category: "Quality"
image: "service-quality.webp"
imageAlt: "An operator carefully reviewing records for quality"
order: 9
date: "2026-09-21"
---

Reconciliation work begins when two views of the same process do not agree. A request may appear complete in one system and open in another. Two files may contain different details for the same reference. A batch total may match even though individual records do not.

The goal is not to make every difference disappear as quickly as possible. It is to establish which records should agree, understand the remaining differences and resolve them through an authorised decision. A tidy report is not useful if it hides unresolved problems.

This guide covers general operational reconciliation. It is not accounting, audit or legal advice, and it does not prescribe controls for financial transactions. Use specialist review when the records or decisions require it.

## Define what should match

State the relationship you expect between the sources. Is each request supposed to have one corresponding record? Can one request create several outputs? Are cancelled items expected to remain visible in one system but not another?

Identify the fields that support a match. A stable reference may be stronger than a name, but even a reference can be missing, reused or formatted differently. Write down the allowed matching logic and the conditions that require human review.

Do not treat identical totals as proof of record-level agreement. In an illustrative batch, one missing item and one duplicate item could leave the total count unchanged. If the business needs confidence in individual records, design the reconciliation at that level.

## Align the time boundary

Choose a clear cut-off for each source. A file exported in the morning and a system viewed later in the day may show different states because legitimate updates occurred between them. Record when each source was captured.

Document expected timing differences. If one system receives updates only after a scheduled process, identify when those updates should appear. An item can remain open as a timing difference without being treated as an unexplained error.

Assign a review point for those differences. “It is probably timing” should not become a permanent explanation. If the expected update does not arrive, the item should move into the appropriate investigation path with an owner and a visible age.

## Preserve the original evidence

Keep source references and a record of the comparison used, within the organisation’s information-handling rules. Avoid editing the original input merely to make the reconciliation easier. If a normalisation step is needed, retain a traceable distinction between the source and the working representation.

Examples of normalisation might include trimming spaces or applying an agreed date representation. More consequential transformations, such as deciding that two different entity names refer to the same organisation, should require an approved rule or review.

The [Government Data Quality Framework](https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework) emphasises metadata, documentation and communicating quality issues so users can interpret data appropriately. In a reconciliation workflow, that means preserving enough context for another person to understand the comparison and its limitations.

## Classify differences before resolving them

Use a small set of categories that lead to useful actions. These might include missing on one side, duplicate, conflicting value, unexpected status, timing difference and insufficient information. Define each category with an example.

Allow an “unclassified” state temporarily when the evidence is incomplete, but require an owner and a next step. Otherwise, it can become a storage place for difficult work that never receives attention.

Keep classification separate from resolution. A record can be correctly classified as a duplicate while still awaiting authority to remove or merge it. This distinction helps the team report progress without claiming the underlying issue has been settled.

## Give every exception an actionable record

A useful exception record includes the source references, the observed difference, the category, the owner, the next action and the date for review. Add the decision history where the resolution requires approval.

Write the question so someone else can answer it. “Please check record” is weak. “The request is marked closed in the intake system, but no accepted output is linked; confirm whether it was completed outside the normal workflow” identifies the missing decision.

Avoid filling the queue with private customer information that is not necessary to investigate. Link to approved source locations rather than copying complete documents into every comment. The security and privacy owners should define what information belongs in the queue.

## Resolve through approved actions

Define which corrections an operator can perform and which need a reviewer. Updating a display format is different from deleting a record, changing a status that triggers another process or merging two entities.

Where possible, separate the decision from the execution record. Keep the approval, the action taken and the verification that followed. This makes it easier to establish whether an issue was resolved as intended rather than merely marked complete.

Do not close an exception just because a message was sent. Use a waiting status when information has been requested. Close only when the agreed resolution condition is met or when an authorised owner explicitly accepts the remaining difference with a documented reason.

## Recheck what the correction affected

After making an approved correction, rerun the relevant comparison or verify the affected records. Check that the intended difference is resolved and that the action did not create a duplicate, remove a required link or change an unrelated field.

For a repeated issue, test the upstream fix on fresh work. If a source export omitted a field, correcting yesterday’s file does not prove tomorrow’s export will contain it. The recurring input needs its own verification.

Use the improvement sequence described in [ASQ’s Plan-Do-Check-Act guidance](https://asq.org/quality-resources/pdca-cycle) as a practical model: plan the change, test it, review the result and act on what you learned. Keep the evidence proportionate to the risk rather than turning every small correction into a major project.

## Review the queue by risk and age

Do not work only from newest to oldest or easiest to hardest. Prioritise using the business consequence, deadline, dependencies and time already spent waiting. An older low-impact formatting difference may not deserve the same urgency as a recent high-impact status mismatch.

At a regular review, ask:

- **Unowned items:** Does every open exception have someone responsible?
- **Missing decisions:** Which items cannot move without a specific approval?
- **Age:** Which cases have exceeded their expected review point?
- **Repeat patterns:** Which source or rule keeps creating the same issue?
- **Evidence:** Can another person understand the investigation from the record?
- **Closure:** Were resolved items verified, not merely reclassified?

Keep a distinction between clearing the queue and improving the process. Both matter. A team can work hard every week to close exceptions while the same preventable cause continues producing new ones.

The aim is not a permanent promise of zero differences. It is a reliable way to detect, explain and resolve the differences that matter. A well-run exception queue makes uncertainty visible instead of disguising it as completed work.

For the underlying field rules, read [data entry quality checks](../data-entry-quality-checks/). For reporting that exposes waiting and recurring rework, use the [operations metrics guide](../operations-metrics-that-matter/).

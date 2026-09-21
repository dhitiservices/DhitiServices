---
title: "Data entry quality starts before the first keystroke"
description: "Build data quality checks around the way records will be used, with clear field rules, exception handling and a practical review routine."
category: "Quality"
image: "service-data.webp"
imageAlt: "An operator working with data on a computer"
order: 2
date: "2026-09-21"
---

Data entry quality is not a typing contest. A quickly completed record is only useful if the next person or system can rely on it. Before asking a team to process more volume, agree what a usable record contains and what should happen when the source information is unclear.

This guide proposes a practical quality routine for ordinary operational records. It is not an assurance standard, a universal sampling plan or a substitute for specialist controls where the information is sensitive or the consequences of an error are significant.

Start with one workflow and one downstream user. A purchase record, a customer contact and a product listing may all live in spreadsheets, but they need different checks. Design the checks around those differences rather than applying the same list everywhere.

## Define quality in terms of use

Ask the person receiving the data what they need to do next. Which fields determine whether a record can be processed? Which mistakes create a wrong action? Which details can be corrected later without interrupting the workflow? The answers should shape the review.

The [Government Data Quality Framework](https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework) describes quality in relation to fitness for purpose and identifies completeness, uniqueness, consistency, timeliness, validity and accuracy as core dimensions. Use those dimensions as questions to ask, not as six equally weighted scores that every dataset must receive.

For an internal contact list, a valid phone format may be important, but it does not prove the number belongs to the intended person. Keep that distinction visible. Passing a format check should never be presented as verification of the underlying fact.

## Create a field guide before a checking sheet

For each important field, document its meaning, accepted values, preferred source and treatment when missing. Include a concrete example. “Date” is not a sufficient definition if one person means the invoice date and another means the date the file arrived.

Separate mandatory information from helpful information. If the team cannot proceed without a reference number, label that requirement explicitly. If a secondary phone number is optional, do not encourage operators to invent a value simply to make a spreadsheet appear complete.

Choose a consistent way to represent unavailable data. A blank, “not provided” and “not applicable” can mean different things. Explain those differences in the field guide and make sure downstream users interpret them the same way.

## Preserve what came from the source

Keep an appropriate link between the entered record and the source that supports it. Depending on the workflow, that could be a document identifier, a source-system reference or an approved file location. Avoid copying sensitive material into extra places merely for convenience.

Where information is transformed, preserve the distinction between the original value and the standardised value. For example, a supplier name may arrive with inconsistent spacing. Cleaning the display name should not remove the reference needed to match it to the original submission.

Define which transformations are allowed without approval. Trimming spaces is different from deciding that two similarly named organisations are the same business. Put the second kind of decision into an exception process with a reviewer who understands its consequences.

## Build checks at the point of entry

Use simple validation where it can prevent obvious mistakes. A date field can reject impossible dates. A controlled list can limit a status field to approved values. A required reference can stop an incomplete record from moving into the next stage.

Treat every validation rule as a design choice that needs testing. An overly restrictive name field might reject legitimate names. A numeric field might incorrectly remove leading zeroes from an identifier. Test the rule against realistic edge cases before relying on it.

Make error messages useful. “Invalid input” gives the operator little guidance. “Enter the reference exactly as shown, including leading zeroes” explains both the correction and the reason. Pair the message with an example when the format is unfamiliar.

## Separate critical checks from cosmetic checks

Create an error classification that reflects business consequences. A record linked to the wrong customer may require an immediate stop. Inconsistent capitalisation may simply need correction before delivery. Both deserve attention, but they should not carry the same operational response.

Have the business owner approve which errors are critical. Do not let the processing team quietly decide that a risky error is acceptable because it is inconvenient to detect. Likewise, do not classify every imperfection as critical and make the category meaningless.

Choose review coverage based on risk, process maturity and evidence. Some fields or transactions may require complete checking. Others may support an agreed sampling approach. This guide does not prescribe a universal sample size; that decision requires knowledge of the work and its potential impact.

## Make exceptions a visible work queue

An unclear record should have a status, an owner and a next action. Do not leave it in an operator’s personal notes or move it to a miscellaneous sheet without a return path. The rest of the team needs to see that the item exists and why it is waiting.

Useful exception notes describe the conflict precisely. “Supplier address unclear” is weaker than “The submitted form and attached invoice show different postal codes; confirmation requested from the supplier owner.” The second version tells the next person what has already been checked.

Track exception age separately from ordinary processing time. A slow decision response may need a different fix from slow data entry. Keeping the two visible prevents a discussion about quality from becoming an unhelpful argument about who worked harder.

## Learn from the errors that repeat

Review recurring error categories rather than reading every correction as an isolated incident. If several operators misunderstand the same field, start by examining the instruction and interface. If one source repeatedly sends incomplete records, improve the intake agreement with that source.

The [Government Data Quality Framework](https://www.gov.uk/government/publications/the-government-data-quality-framework/the-government-data-quality-framework) recommends addressing causes at source and assessing quality across the data lifecycle. A practical application is to fix an ambiguous form rather than repeatedly correcting the same ambiguity after submission.

Keep a short change log linking the observed problem to the action taken. After changing a rule, inspect fresh examples to see whether the intended problem actually reduced. Do not assume that publishing an updated instruction means the team understood or adopted it.

## Run a small, useful quality review

For a weekly review, bring a few representative records: one accepted without changes, one corrected, one blocked and one unusual case. Walk through the evidence and ask whether the current rules made the right action obvious.

Use this checklist to keep the conversation specific:

- **Definitions:** Are important fields understood the same way by everyone?
- **Source traceability:** Can the reviewer find the approved supporting information?
- **Critical risks:** Are high-consequence errors being checked appropriately?
- **Exceptions:** Does every blocked record have an owner and next step?
- **Repeat issues:** Which instruction, input or tool should change?
- **Follow-through:** Who will verify that the change worked?

Close with one or two improvements that someone can actually complete. A long list of unowned observations is not a quality system.

If your team needs better instructions, start with [writing usable SOPs](../write-standard-operating-procedures/). If disagreements between sources dominate the work, use the [reconciliation and exception guide](../reconciliation-exception-management/) to build a clearer decision path.

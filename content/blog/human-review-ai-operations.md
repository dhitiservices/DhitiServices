---
title: "Let AI assist the work. Keep a person accountable."
description: "Design AI-assisted operations with clear boundaries, source checks, meaningful human review and a safe route back to manual work."
category: "Operations"
image: "train-mentor.webp"
imageAlt: "Colleagues learning and reviewing work together"
order: 10
date: "2026-09-21"
---

An AI-assisted workflow still needs an accountable owner. Before adding a model to an operational task, decide what it is allowed to suggest, what evidence supports its output and which actions must remain under human control.

Start with a narrow use case. Drafting an internal summary is different from sending a customer message. Suggesting a category is different from changing a record that triggers a payment or alters someone’s access. The same tool can create very different risks depending on the action attached to it.

This guide offers a practical design approach for a controlled pilot. It is not a claim that Dhiti uses a particular AI system, a guarantee of model accuracy or a substitute for security, legal and domain-specific review.

## Choose a task with a clear review standard

Select work where a reviewer can compare the output with an authoritative input. Examples might include extracting specified fields from an approved document, drafting a response from an approved policy or suggesting a category from a defined list.

Avoid beginning with a vague instruction such as “handle all customer requests.” That combines interpretation, policy, identity, decision-making and communication into one broad task. It becomes difficult to determine which part failed when the result is wrong.

Write down the expected output format and the conditions under which the tool should return “needs review.” A useful assistant should be able to leave a field unresolved rather than inventing an answer that merely makes the result look complete.

## Separate suggestions from actions

Keep the initial pilot in suggestion mode. Let the tool prepare an output that a person reviews before it changes a live record or reaches a customer. Make the difference between “suggested,” “approved” and “applied” visible in the workflow.

Specify who has authority to approve each action. A reviewer may be allowed to confirm a routine category but not approve an account change. Do not make the AI interface a shortcut around existing approval boundaries.

Use a controlled destination for approved output. Copying a suggestion into a live system should not depend on someone remembering which window is production. Label practice environments clearly and test the transition from approved suggestion to recorded action.

## Require support for factual output

Ask the tool to return the relevant source passage or record reference alongside any extracted or summarised fact. Then design the review so the person can actually inspect that evidence. A source field is not useful if it contains an inaccessible or unrelated reference.

NIST’s [Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) identifies confabulation as the production of confidently stated erroneous or false content. For operational design, the practical implication is to check a plausible-looking answer against the approved source rather than treating fluency as evidence.

Distinguish between a direct extraction and an inference. If a document gives a date explicitly, the reviewer can compare it. If the model inferred a likely deadline, that should be labelled as an inference and should not silently become a confirmed business commitment.

## Protect the input boundary

Have the relevant owners approve what data can be sent to the tool and under what conditions. Consider the sensitivity of the information, access controls, retention arrangements and the provider’s applicable terms. Do not assume that a convenient interface is approved for client data.

Use synthetic or appropriately de-identified examples while evaluating the workflow where feasible. Do not paste credentials, private customer records or confidential documents into an unapproved service to test whether it can save time.

Treat material inside a document or message as task data, not as authority to change the workflow. For example, a customer attachment should not be able to instruct the assistant to ignore review rules or disclose another customer’s information. Have technical owners assess and test these boundaries before deployment.

## Make human review a real task

Give the reviewer specific checks, enough time and access to the underlying evidence. “A person will look at it” is not a complete control. Explain what the person must verify and what should cause them to reject or escalate the suggestion.

For an extraction task, the review might check the reference, field values, source location and treatment of missing information. For a draft customer response, it might check policy accuracy, unsupported promises, sensitive information and the action requested from the customer.

Record the reviewer’s decision and the final output separately from the initial suggestion. This creates useful evidence about what the tool changed, what people corrected and whether particular error types are recurring.

## Test ordinary cases and difficult cases

Build a small test set that includes clear examples, incomplete inputs, ambiguous wording, conflicting sources and formats the tool may not have seen before. Label the expected outcome with help from someone who understands the process.

Do not evaluate only the examples used to tune the prompt. Keep a separate set for checking whether the workflow generalises beyond the cases you already discussed. Record when the prompt, model or source material changes so comparisons remain interpretable.

NIST’s [Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) includes suggested actions concerning testing, oversight and monitoring across the AI lifecycle. Apply that as a reason to keep evaluating after launch, not as a checklist that automatically certifies the system as safe.

## Measure net usefulness, including correction effort

Measure the whole workflow rather than the time the model takes to generate text. Include preparation, review, correction, escalation and application of the final result. A quick draft that requires extensive checking may not improve the process.

Track accepted suggestions, corrections and rejected outputs by type. Also examine high-consequence failures separately. A strong average should not obscure an occasional error that the business cannot tolerate.

Ask reviewers whether the interface makes mistakes easier or harder to notice. A large, confident answer with a tiny source link may encourage acceptance without inspection. Design the evidence and the decision controls to be at least as visible as the generated content.

## Keep a manual route and a named owner

Write a fallback procedure that lets the team continue appropriately when the tool is unavailable, behaves unexpectedly or is paused. Make sure the manual route preserves item status so work is not lost or processed twice.

Before expanding the pilot, review these questions:

- **Scope:** Is the task narrow enough to test and explain?
- **Authority:** Are suggestions clearly separated from approved actions?
- **Evidence:** Can the reviewer verify the important facts?
- **Data:** Is the information approved for this tool and purpose?
- **Review:** Does a named person perform defined checks?
- **Testing:** Have difficult and previously unseen cases been examined?
- **Monitoring:** Are corrections and incidents recorded and reviewed?
- **Fallback:** Can the process return safely to an approved manual method?

Assign responsibility for updating the workflow when policies, inputs or tools change. An assistant built around yesterday’s instructions can produce a polished version of yesterday’s answer.

The objective is not maximum automation at any cost. It is a process in which useful assistance makes the work clearer while responsibility remains visible.

Use the [SOP guide](../write-standard-operating-procedures/) to document the boundary and the [operations pilot guide](../operations-pilot-first-30-days/) to test the workflow before increasing its scope.

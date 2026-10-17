export const services = [
  {
    slug: 'data-back-office', name: 'Data & Back Office', full: 'Data & Back Office Operations',
    image: 'service-data.webp', eyebrow: 'Accuracy, built into the process',
    headline: 'Give your data the attention it deserves.',
    intro: 'Data entry, cataloguing, document processing and reconciliation. A trained team handles the detail, with verification built into the work.',
    summary: 'Keep records, catalogues and everyday processing accurate, organised and moving.',
    fit: 'For teams spending too much time correcting records, clearing backlogs or moving information between systems.',
    work: [
      ['Data entry & maintenance', 'Capture and update records against your source material, required fields and agreed formatting rules.'],
      ['Catalogue operations', 'Organise product or property information, check completeness and flag records that need clarification.'],
      ['Document processing', 'Extract, classify and review information using a documented checklist and a clear exception path.'],
      ['Reconciliation support', 'Compare records, identify mismatches and prepare exceptions for your authorised team to resolve.']
    ],
    inputs: ['A representative sample of the work', 'Your source of truth and field definitions', 'Examples of correct and incorrect output', 'Volume, turnaround needs and access requirements'],
    outputs: ['Completed records in the agreed format', 'A separate list of unresolved exceptions', 'Quality checks against agreed acceptance criteria', 'A named owner for questions and feedback'],
    note: 'We agree access permissions and handling requirements before work starts. Sensitive or regulated data needs a specific review of fit; it is not assumed to be in scope.',
    guide: 'data-entry-quality-checks'
  },
  {
    slug: 'customer-support', name: 'Customer & Process Support', full: 'Customer & Process Support',
    image: 'service-support.webp', eyebrow: 'A dependable front line',
    headline: 'Support that feels like part of your team.',
    intro: 'Phone and written support, query handling and follow-ups. People trained on your process, your tone and the limits of what they can resolve.',
    summary: 'Give customers clear answers and keep process follow-ups from falling through the gaps.',
    fit: 'For businesses that need consistent query handling without asking their core team to manage every routine interaction.',
    work: [
      ['Query handling', 'Work from an approved knowledge base to answer routine questions clearly and consistently.'],
      ['Written support', 'Handle assigned email or message queues using your response standards and agreed channels.'],
      ['Phone support', 'Discuss voice requirements, language, coverage and call handling before agreeing a suitable scope.'],
      ['Process follow-ups', 'Track open items, request missing information and hand unresolved cases to the right owner.']
    ],
    inputs: ['Your support playbook and tone of voice', 'Approved answers and escalation rules', 'Channel access and coverage requirements', 'Examples of common and sensitive queries'],
    outputs: ['Handled queries with clear case notes', 'Escalations with the context your team needs', 'Visibility into pending items and recurring questions', 'Quality feedback to improve the playbook'],
    note: 'Coverage hours, languages, response targets and authority to issue refunds or make commitments are agreed before launch. We do not assume 24/7 or multilingual coverage.',
    guide: 'customer-support-playbook'
  },
  {
    slug: 'quality-audit', name: 'Quality & Audit', full: 'Quality & Audit',
    image: 'service-quality.webp', eyebrow: 'A second set of eyes',
    headline: 'Catch the detail before it becomes a problem.',
    intro: 'Checking and verification for operational work. An independent second pass against your rules, with exceptions recorded rather than quietly passed along.',
    summary: 'Check completeness, consistency and accuracy before work reaches the next stage.',
    fit: 'For teams that need a repeatable review process, not another round of ad hoc checking by already-busy colleagues.',
    work: [
      ['Record verification', 'Check completed entries against source information and documented acceptance rules.'],
      ['Completeness checks', 'Identify missing fields, documents and evidence before work is marked complete.'],
      ['Process adherence', 'Review whether the agreed operational steps and approval requirements have been followed.'],
      ['Exception reporting', 'Group errors and unanswered questions so the process owner can make informed corrections.']
    ],
    inputs: ['The work to be reviewed and its source', 'A checklist with explicit pass/fail rules', 'Error categories and escalation thresholds', 'Your review scope and reporting cadence'],
    outputs: ['Reviewed work with traceable findings', 'An exception log with actionable detail', 'Recurring error patterns for team coaching', 'Feedback for improving the underlying process'],
    note: 'This is operational quality review. It is not a statutory audit, legal opinion, certification or a substitute for a regulated professional.',
    guide: 'operations-metrics-that-matter'
  },
  {
    slug: 'dedicated-operations', name: 'Dedicated Operations', full: 'Group & Internal Operations',
    image: 'service-group.webp', eyebrow: 'Continuity, not a revolving door',
    headline: 'An operational team that knows your work.',
    intro: 'Ongoing support run as an embedded extension of your business. Clear responsibilities, process-specific training and a named owner accountable for delivery.',
    summary: 'Build dependable day-to-day capacity around a defined process and a consistent team.',
    fit: 'For businesses with repeatable work that needs sustained ownership, documented handovers and regular communication.',
    work: [
      ['Recurring back-office work', 'Run agreed operational tasks to a documented routine, with responsibilities made explicit.'],
      ['Internal coordination', 'Keep handovers, pending information and cross-team follow-ups visible.'],
      ['Queue management', 'Organise incoming work by priority and flag capacity or process constraints early.'],
      ['Process documentation', 'Maintain working instructions as your requirements evolve, subject to owner approval.']
    ],
    inputs: ['A defined workflow and accountable sponsor', 'Expected volumes and priority rules', 'Tool access, dependencies and permissions', 'A communication and review cadence'],
    outputs: ['A trained team aligned to the agreed scope', 'A named point of accountability', 'Visibility into completed and pending work', 'Documented changes and handovers'],
    note: 'Team size, working hours, commercials and continuity arrangements are scoped together. We start with a pilot rather than promising capacity before reviewing the work.',
    guide: 'business-process-handover-checklist'
  }
];

export const stages = [
  ['Understand the work', 'Share the process, a representative sample and the volume. We map the steps, exceptions, access needs and what a good result looks like.'],
  ['Train for your process', 'We document the workflow, prepare the team and practise on sample work before taking responsibility for live delivery.'],
  ['Prove it in a pilot', 'Begin with a defined batch. Review quality, turnaround and escalation handling against criteria agreed with you.'],
  ['Scale what works', 'Expand only when the process is steady. Keep a named owner, regular reviews and clear visibility into unresolved work.']
];

export const businessFaqs = [
  ['What work is a good fit for Dhiti?', 'Repeatable data, back-office, customer support and quality-review processes with clear inputs and acceptance rules. We review the work before recommending a scope. If it is not a fit, we will tell you.'],
  ['How quickly can a team get started?', 'Timing depends on process complexity, volume, training and access. We start with a small pilot and agree a realistic plan after reviewing your requirements.'],
  ['How do you measure quality?', 'We define what correct output looks like before launch, train against those rules and build verification into the workflow. Exceptions go to a named owner rather than being treated as completed work.'],
  ['Can you support a travel business?', 'We can discuss travel-related data, catalogue, support and back-office workflows. System access, specialist skills, coverage hours and approval authority are assessed during scoping.'],
  ['How is pricing decided?', 'Pricing is scoped to the work, volume, coverage and level of review required. Share your requirements so we can discuss a suitable engagement rather than offer a one-size-fits-all rate.']
];

export function meetingUpdatePayload(body) {
  return {
    meeting_at: body.meeting_at,
    duration_minutes: body.duration_minutes ? Number(body.duration_minutes) : null,
    meeting_outcome: body.meeting_outcome,
    budget_discussed: body.budget_discussed || null,
    deadline: body.deadline || null,
    notes: body.notes || null,
    requirements_discussed: body.requirements_discussed || null,
  };
}

interface EditableEntity {
  creator_id: number
  participants: { id: number }[]
}

// Edit rule shared by trips and projects (mirrors the backend
// can_user_edit_entity): creator or participant. Users who can only *see*
// the entity get no mutation UI — every action would 404.
export function canEditEntity(
  user: { id: number } | null | undefined,
  entity: EditableEntity,
): boolean {
  return !!user && (entity.creator_id === user.id || entity.participants.some((p) => p.id === user.id))
}

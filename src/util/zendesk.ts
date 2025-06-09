export function getTicketField(ticket: any, fieldId: string | number) {
  return ticket.custom_fields.find((field: any) => String(field.id) == String(fieldId))?.value
}
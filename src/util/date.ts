export const datetimeStringToIso = (date: string) => {
  return new Date(date.replace(" ", "T")).toISOString();
};
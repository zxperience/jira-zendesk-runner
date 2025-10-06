export const datetimeStringToIso = (date: string) => {
  return new Date(date.replace(" ", "T")).toISOString().replace("Z", "-0300");
};

export function formatToISOWithOffset(dateStr: string): string {
  const [datePart, timePart] = dateStr.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));

  date.setHours(date.getHours() - 3);

  const pad = (n: number) => String(n).padStart(2, "0");

  const formatted =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000+0300`;

  return formatted;
}
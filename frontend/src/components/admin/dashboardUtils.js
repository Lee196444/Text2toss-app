// Pure date/price formatting helpers shared by the admin dashboard.

export const getDaysInMonth = (date) => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

export const getFirstDayOfWeek = (date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
};

export const formatCalendarDate = (year, month, day) => {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const formatPrice = (price) => {
  return `$${price?.toFixed(2) || '0.00'}`;
};

export const formatTime = (timeRange) => {
  return timeRange;
};

export const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
};

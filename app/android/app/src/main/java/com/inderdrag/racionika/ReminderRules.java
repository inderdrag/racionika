package com.inderdrag.racionika;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import java.util.TimeZone;

/** Pure rules: no Activity, WebView, networking or Android dependency. */
public final class ReminderRules {
  public static final long HALF_HOUR = 30 * 60 * 1000L;

  private ReminderRules() {}

  public static int minute(String time) {
    if (time == null || !time.matches("([01]\\d|2[0-3]):[0-5]\\d"))
      throw new IllegalArgumentException("time");
    return Integer.parseInt(time.substring(0, 2)) * 60 + Integer.parseInt(time.substring(3));
  }

  public static boolean awake(long at, int wake, int sleep, TimeZone zone) {
    Calendar c = Calendar.getInstance(zone);
    c.setTimeInMillis(at);
    int minute = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    return (minute - wake + 1440) % 1440 < (sleep - wake + 1440) % 1440;
  }

  public static int isoDay(Calendar c) {
    return (c.get(Calendar.DAY_OF_WEEK) + 5) % 7 + 1;
  }

  public static boolean dayAllowed(long at, int[] days, TimeZone zone) {
    Calendar c = Calendar.getInstance(zone);
    c.setTimeInMillis(at);
    for (int day : days) if (isoDay(c) == day) return true;
    return false;
  }

  public static String day(long at, TimeZone zone) {
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
    f.setTimeZone(zone);
    return f.format(at);
  }

  public static long next(
      long after, int hour, int minute, int[] days, int calendarWeekday, TimeZone zone) {
    Calendar c = Calendar.getInstance(zone);
    c.setTimeInMillis(after);
    for (int i = 0; i < 9; i++) {
      if (i > 0) c.add(Calendar.DATE, 1);
      c.set(Calendar.HOUR_OF_DAY, hour);
      c.set(Calendar.MINUTE, minute);
      c.set(Calendar.SECOND, 0);
      c.set(Calendar.MILLISECOND, 0);
      // A nonexistent spring DST local time is skipped rather than shifted into sleep.
      if (c.get(Calendar.HOUR_OF_DAY) != hour || c.get(Calendar.MINUTE) != minute) continue;
      if (c.getTimeInMillis() <= after) continue;
      if (calendarWeekday > 0 && c.get(Calendar.DAY_OF_WEEK) != calendarWeekday) continue;
      for (int d : days) if (isoDay(c) == d) return c.getTimeInMillis();
    }
    return -1;
  }

  public static boolean recorded(long[] meals, long occurrence, long now) {
    for (long meal : meals) if (meal >= occurrence - HALF_HOUR && meal <= now) return true;
    return false;
  }

  public static boolean goalMet(double total, double goal) {
    return Double.isFinite(total) && Double.isFinite(goal) && goal > 0 && total >= goal;
  }

  public static long followup(long deliveredAt, int stage, long nextMeal, boolean allowed) {
    long due = deliveredAt + HALF_HOUR;
    return stage >= 0 && stage < 2 && allowed && due < nextMeal ? due : -1;
  }

  public static long snooze(long now, long nextMeal, boolean allowed) {
    long due = now + HALF_HOUR;
    return allowed && due < nextMeal ? due : -1;
  }

  public static boolean fresh(long due, long now) {
    return due <= now && now - due <= 90 * 60 * 1000L;
  }
}

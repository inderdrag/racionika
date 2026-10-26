package com.inderdrag.racionika;

import static org.junit.Assert.*;

import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;
import org.junit.Test;

public class ReminderRulesTest {
  private final TimeZone zone = TimeZone.getTimeZone("Europe/Moscow");

  private long at(String value) throws Exception {
    return at(value, zone);
  }

  private long at(String value, TimeZone z) throws Exception {
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US);
    f.setTimeZone(z);
    return f.parse(value).getTime();
  }

  @Test
  public void threeStagesOnly() throws Exception {
    long first = at("2026-10-26 08:00"), next = at("2026-10-26 13:00");
    long second = ReminderRules.followup(first, 0, next, true);
    long third = ReminderRules.followup(second, 1, next, true);
    assertEquals(at("2026-10-26 08:30"), second);
    assertEquals(at("2026-10-26 09:00"), third);
    assertEquals(-1, ReminderRules.followup(third, 2, next, true));
  }

  @Test
  public void skipsSleepAndNextMealCollision() throws Exception {
    long start = at("2026-10-26 21:45");
    assertEquals(-1, ReminderRules.followup(start, 0, Long.MAX_VALUE, false));
    assertEquals(-1, ReminderRules.followup(start, 0, start + ReminderRules.HALF_HOUR, true));
  }

  @Test
  public void quietHoursBoundaries() throws Exception {
    assertTrue(ReminderRules.awake(at("2026-10-26 08:00"), 480, 1320, zone));
    assertFalse(ReminderRules.awake(at("2026-10-26 22:00"), 480, 1320, zone));
    assertFalse(ReminderRules.awake(at("2026-10-26 07:59"), 480, 1320, zone));
  }

  @Test
  public void overnightAwakeWindow() throws Exception {
    assertTrue(ReminderRules.awake(at("2026-10-27 01:00"), 1200, 480, zone));
    assertFalse(ReminderRules.awake(at("2026-10-27 08:00"), 1200, 480, zone));
  }

  @Test
  public void mondayWednesdayFridaySchedule() throws Exception {
    assertEquals(
        at("2026-10-28 08:00"),
        ReminderRules.next(at("2026-10-26 08:00"), 8, 0, new int[] {1, 3, 5}, 0, zone));
    assertEquals(
        at("2026-10-26 08:00"),
        ReminderRules.next(at("2026-10-25 20:00"), 8, 0, new int[] {1, 3, 5}, 0, zone));
  }

  @Test
  public void localDayAtMidnight() throws Exception {
    assertEquals("2026-10-27", ReminderRules.day(at("2026-10-27 00:01"), zone));
  }

  @Test
  public void recordedBeforeOrAfterPromptCancels() throws Exception {
    long start = at("2026-10-26 08:00"), now = at("2026-10-26 08:30");
    assertTrue(ReminderRules.recorded(new long[] {at("2026-10-26 08:15")}, start, now));
    assertTrue(ReminderRules.recorded(new long[] {at("2026-10-26 07:45")}, start, now));
  }

  @Test
  public void oldFutureAndEmptyMealsDoNotCancel() throws Exception {
    long start = at("2026-10-26 08:00"), now = at("2026-10-26 08:30");
    assertFalse(
        ReminderRules.recorded(
            new long[] {at("2026-10-25 08:15"), at("2026-10-26 09:00")}, start, now));
    assertFalse(ReminderRules.recorded(new long[] {}, start, now));
  }

  @Test
  public void goalsResetByCallerDayAndRequirePositiveTarget() {
    assertTrue(ReminderRules.goalMet(2400, 2400));
    assertTrue(ReminderRules.goalMet(2600, 2400));
    assertFalse(ReminderRules.goalMet(200, 2400));
    assertFalse(ReminderRules.goalMet(2400, 0));
    assertFalse(ReminderRules.goalMet(Double.NaN, 2400));
  }

  @Test
  public void noStaleFloodAfterRestart() throws Exception {
    long due = at("2026-10-26 08:00");
    assertTrue(ReminderRules.fresh(due, at("2026-10-26 08:10")));
    assertTrue(ReminderRules.fresh(due, at("2026-10-26 09:00")));
    assertFalse(ReminderRules.fresh(due, at("2026-10-26 10:00")));
    assertFalse(ReminderRules.fresh(due, due - 1));
  }

  @Test
  public void springDstGapIsSkipped() throws Exception {
    TimeZone z = TimeZone.getTimeZone("Europe/Berlin");
    assertEquals(
        at("2026-03-30 02:30", z),
        ReminderRules.next(
            at("2026-03-28 23:00", z), 2, 30, new int[] {1, 2, 3, 4, 5, 6, 7}, 0, z));
  }

  @Test
  public void weekdayMotivationDoesNotRepeatEveryDay() throws Exception {
    assertEquals(
        at("2026-10-28 11:00"),
        ReminderRules.next(
            at("2026-10-26 09:00"), 11, 0, new int[] {1, 2, 3, 4, 5, 6, 7}, 4, zone));
  }
}

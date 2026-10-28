package com.inderdrag.racionika;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.HashSet;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Persistent AlarmManager scheduler. Receivers work without JS or a running Activity. */
public final class ReminderEngine {
  private static final String STORE = "racionika_reminders_v2";
  private static final String ACK = "com.inderdrag.racionika.MEAL_ACK";
  private static final String SNOOZE = "com.inderdrag.racionika.MEAL_SNOOZE";
  private static final String ACTION = "com.inderdrag.racionika.REMINDER";

  private ReminderEngine() {}

  private static SharedPreferences prefs(Context c) {
    return c.getSharedPreferences(STORE, Context.MODE_PRIVATE);
  }

  private static JSONArray array(String value) {
    try {
      return new JSONArray(value);
    } catch (JSONException e) {
      return new JSONArray();
    }
  }

  private static int[] days(JSONObject item) {
    JSONArray a = item.optJSONArray("days");
    if (a == null) return new int[] {1, 2, 3, 4, 5, 6, 7};
    int[] result = new int[a.length()];
    for (int i = 0; i < a.length(); i++) result[i] = a.optInt(i);
    return result;
  }

  private static boolean allowed(JSONObject item, long at) {
    TimeZone z = TimeZone.getDefault();
    return ReminderRules.dayAllowed(at, days(item), z)
        && ReminderRules.awake(
            at,
            ReminderRules.minute(item.optString("wake", "08:00")),
            ReminderRules.minute(item.optString("sleep", "22:00")),
            z);
  }

  private static long next(JSONObject item, long after) {
    return ReminderRules.next(
        after,
        item.optInt("hour"),
        item.optInt("minute"),
        days(item),
        item.optInt("weekday"),
        TimeZone.getDefault());
  }

  private static PendingIntent alarmIntent(
      Context c, JSONObject item, int stage, long occurrence, long due, String generation) {
    Intent intent =
        new Intent(c, ReminderReceiver.class)
            .setAction(ACTION)
            .putExtra("id", item.optInt("id"))
            .putExtra("stage", stage)
            .putExtra("occurrence", occurrence)
            .putExtra("due", due)
            .putExtra("generation", generation);
    int code = (stage == 0 ? 100000 : 200000) + item.optInt("id");
    return PendingIntent.getBroadcast(
        c, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void schedule(Context c, JSONObject item, int stage, long occurrence, long due) {
    if (due <= 0) return;
    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    PendingIntent pi =
        alarmIntent(c, item, stage, occurrence, due, prefs(c).getString("generation", ""));
    try {
      if (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms())
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pi);
      else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pi);
    } catch (SecurityException e) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, due, pi);
    }
  }

  private static void cancel(Context c, JSONObject item, int stage) {
    AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
    am.cancel(alarmIntent(c, item, stage, 0, 0, ""));
  }

  private static void cancelAll(Context c, JSONArray items) {
    for (int i = 0; i < items.length(); i++) {
      JSONObject item = items.optJSONObject(i);
      if (item == null) continue;
      cancel(c, item, 0);
      cancel(c, item, 1);
      NotificationManagerCompat.from(c).cancel(item.optInt("id"));
    }
  }

  private static void validate(JSONArray items) throws JSONException {
    if (items.length() > 100) throw new JSONException("Too many reminders");
    Set<Integer> ids = new HashSet<>();
    for (int i = 0; i < items.length(); i++) {
      JSONObject item = items.getJSONObject(i);
      int id = item.getInt("id");
      if (id < 10000 || id >= 40000 || !ids.add(id)) throw new JSONException("Invalid id");
      int h = item.getInt("hour"), m = item.getInt("minute"), weekday = item.optInt("weekday");
      if (h < 0 || h > 23 || m < 0 || m > 59 || weekday < 0 || weekday > 7)
        throw new JSONException("Invalid time");
      String channel = item.getString("channel");
      if (!channel.equals("meals") && !channel.equals("water") && !channel.equals("motivation"))
        throw new JSONException("Invalid channel");
      int wake = ReminderRules.minute(item.optString("wake", "08:00")),
          sleep = ReminderRules.minute(item.optString("sleep", "22:00"));
      if (wake == sleep || days(item).length == 0 || days(item).length > 7)
        throw new JSONException("Invalid schedule");
      for (int day : days(item)) if (day < 1 || day > 7) throw new JSONException("Invalid day");
      if ((h * 60 + m - wake + 1440) % 1440 >= (sleep - wake + 1440) % 1440)
        throw new JSONException("Sleep time");
    }
  }

  public static synchronized void configure(Context c, JSONArray items, JSONObject progress)
      throws JSONException {
    validate(items);
    if (progress != null && progress.toString().length() > 30000)
      throw new JSONException("Too much progress");
    SharedPreferences p = prefs(c);
    String old = p.getString("items", "[]"),
        oldChains = p.getString("chains", "[]"),
        generation = p.getString("generation", ""),
        oldProgress = p.getString("progress", "{}");
    if (old.equals(items.toString())) {
      if (items.length() == 0) {
        cancel(c, testItem(), 0);
        if (!p.edit().remove("progress").remove("testAt").commit())
          throw new IllegalStateException("Storage failed");
      } else if (progress != null) syncProgress(c, progress);
      restore(c);
      return;
    }
    cancelAll(c, array(old));
    SharedPreferences.Editor edit =
        p.edit()
            .putString("items", items.toString())
            .putString("chains", "[]")
            .putString("displayed", "{}")
            .putString("generation", java.util.UUID.randomUUID().toString());
    if (items.length() == 0) {
      edit.remove("progress").remove("testAt");
      cancel(c, testItem(), 0);
    } else if (progress != null) edit.putString("progress", progress.toString());
    if (!edit.commit()) {
      p.edit()
          .putString("items", old)
          .putString("chains", oldChains)
          .putString("generation", generation)
          .putString("progress", oldProgress)
          .commit();
      restore(c);
      throw new IllegalStateException("Storage failed");
    }
    try {
      restore(c);
    } catch (RuntimeException failure) {
      cancelAll(c, items);
      p.edit()
          .putString("items", old)
          .putString("chains", oldChains)
          .putString("generation", generation)
          .putString("progress", oldProgress)
          .commit();
      restore(c);
      throw failure;
    }
  }

  private static JSONObject find(Context c, int id) {
    JSONArray items = array(prefs(c).getString("items", "[]"));
    for (int i = 0; i < items.length(); i++) {
      JSONObject item = items.optJSONObject(i);
      if (item != null && item.optInt("id") == id) return item;
    }
    return null;
  }

  private static boolean complete(Context c, JSONObject item, long occurrence, long now) {
    SharedPreferences p = prefs(c);
    JSONObject data;
    try {
      data = new JSONObject(p.getString("progress", "{}"));
    } catch (JSONException e) {
      return false;
    }
    JSONArray rows = data.optJSONArray("days");
    if (rows == null) return false;
    String today = ReminderRules.day(now, TimeZone.getDefault()),
        channel = item.optString("channel");
    for (int i = 0; i < rows.length(); i++) {
      JSONObject row = rows.optJSONObject(i);
      if (row == null) continue;
      if (item.optBoolean("stopWhenGoal", true) && today.equals(row.optString("day"))) {
        if (channel.equals("water")
            && ReminderRules.goalMet(row.optDouble("water"), data.optDouble("waterGoal")))
          return true;
        if (channel.equals("meals")
            && ReminderRules.goalMet(row.optDouble("kcal"), data.optDouble("calorieGoal")))
          return true;
      }
      if (channel.equals("meals")) {
        JSONArray list = row.optJSONArray("meals");
        if (list == null) continue;
        long[] meals = new long[list.length()];
        for (int k = 0; k < list.length(); k++) meals[k] = list.optLong(k);
        if (ReminderRules.recorded(meals, occurrence, now)) return true;
      }
    }
    return false;
  }

  private static void saveChain(Context c, JSONObject item, int stage, long occurrence, long due)
      throws JSONException {
    JSONArray old = array(prefs(c).getString("chains", "[]")), result = new JSONArray();
    for (int i = 0; i < old.length(); i++) {
      JSONObject row = old.optJSONObject(i);
      if (row != null && row.optInt("id") != item.optInt("id")) result.put(row);
    }
    if (stage > 0)
      result.put(
          new JSONObject()
              .put("id", item.optInt("id"))
              .put("stage", stage)
              .put("occurrence", occurrence)
              .put("due", due));
    if (!prefs(c).edit().putString("chains", result.toString()).commit())
      throw new IllegalStateException("Storage failed");
  }

  private static void clearChain(Context c, JSONObject item) throws JSONException {
    cancel(c, item, 1);
    saveChain(c, item, 0, 0, 0);
  }

  private static long nextSlot(Context c, String channel, long after) {
    long earliest = Long.MAX_VALUE;
    JSONArray all = array(prefs(c).getString("items", "[]"));
    for (int i = 0; i < all.length(); i++) {
      JSONObject it = all.optJSONObject(i);
      if (it != null && it.optString("channel").equals(channel)) {
        long n = next(it, after);
        if (n > 0) earliest = Math.min(n, earliest);
      }
    }
    return earliest;
  }

  private static long nextMeal(Context c, long after) {
    return nextSlot(c, "meals", after);
  }

  private static PendingIntent mealAction(
      Context c, JSONObject item, long occurrence, String action) {
    Intent intent =
        new Intent(c, ReminderReceiver.class)
            .setAction(action)
            .putExtra("id", item.optInt("id"))
            .putExtra("occurrence", occurrence)
            .putExtra("generation", prefs(c).getString("generation", ""));
    return PendingIntent.getBroadcast(
        c,
        (action.equals(ACK) ? 400000 : 500000) + item.optInt("id"),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  }

  private static void handleMealAction(Context c, Intent intent) throws JSONException {
    JSONObject item = find(c, intent.getIntExtra("id", -1));
    if (item == null || !item.optString("channel").equals("meals")) return;
    long now = System.currentTimeMillis(), occurrence = intent.getLongExtra("occurrence", 0);
    JSONObject displayed = new JSONObject(prefs(c).getString("displayed", "{}"));
    JSONObject row = displayed.optJSONObject(String.valueOf(item.optInt("id")));
    if (row == null
        || row.optLong("occurrence") != occurrence
        || occurrence <= 0
        || now < occurrence
        || nextMeal(c, occurrence) <= now) return;
    clearChain(c, item);
    if (SNOOZE.equals(intent.getAction())
        && allowed(item, now)
        && !complete(c, item, occurrence, now)) {
      long due =
          ReminderRules.snooze(
              now, nextMeal(c, occurrence), allowed(item, now + ReminderRules.HALF_HOUR));
      if (due > 0) {
        int stage = Math.min(2, row.optInt("stage") + 1);
        saveChain(c, item, stage, occurrence, due);
        schedule(c, item, stage, occurrence, due);
      }
    }
    displayed.remove(String.valueOf(item.optInt("id")));
    if (!prefs(c).edit().putString("displayed", displayed.toString()).commit())
      throw new IllegalStateException("Storage failed");
    NotificationManagerCompat.from(c).cancel(item.optInt("id"));
  }

  public static synchronized void receive(Context c, Intent intent) throws JSONException {
    SharedPreferences p = prefs(c);
    if (!p.getString("generation", "").equals(intent.getStringExtra("generation"))) return;
    if (ACK.equals(intent.getAction()) || SNOOZE.equals(intent.getAction())) {
      handleMealAction(c, intent);
      return;
    }
    if (intent.getIntExtra("id", -1) == 39999) {
      long due = intent.getLongExtra("due", 0);
      if (due == p.getLong("testAt", 0)) {
        p.edit().remove("testAt").commit();
        if (ReminderRules.fresh(due, System.currentTimeMillis())) show(c, testItem(), 0, due);
      }
      return;
    }
    JSONObject item = find(c, intent.getIntExtra("id", -1));
    if (item == null) return;
    int stage = intent.getIntExtra("stage", 0);
    long now = System.currentTimeMillis(),
        occurrence = intent.getLongExtra("occurrence", 0),
        due = intent.getLongExtra("due", 0);
    if (stage == 0) {
      long n = next(item, now);
      schedule(c, item, 0, n, n);
    } else {
      // Reject replaced, already completed or replayed follow-up intents.
      boolean current = false;
      JSONArray chains = array(p.getString("chains", "[]"));
      for (int i = 0; i < chains.length(); i++) {
        JSONObject row = chains.optJSONObject(i);
        if (row != null
            && row.optInt("id") == item.optInt("id")
            && row.optInt("stage") == stage
            && row.optLong("due") == due) current = true;
      }
      if (!current) return;
    }
    clearChain(c, item);
    if (!ReminderRules.fresh(due, now) || !allowed(item, now) || complete(c, item, occurrence, now))
      return;
    if (nextSlot(c, item.optString("channel"), occurrence) <= now) return;
    boolean shown = show(c, item, stage, occurrence);
    if (shown
        && item.optString("channel").equals("meals")
        && item.optBoolean("followups", true)
        && stage < 2) {
      long followAt =
          ReminderRules.followup(
              now, stage, nextMeal(c, occurrence), allowed(item, now + ReminderRules.HALF_HOUR));
      if (followAt > 0) {
        saveChain(c, item, stage + 1, occurrence, followAt);
        schedule(c, item, stage + 1, occurrence, followAt);
      }
    }
  }

  private static boolean show(Context c, JSONObject item, int stage, long occurrence)
      throws JSONException {
    if (Build.VERSION.SDK_INT >= 33
        && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) return false;
    NotificationManagerCompat manager = NotificationManagerCompat.from(c);
    if (!manager.areNotificationsEnabled()) return false;
    String kind = item.optString("channel"), channel = "racionika_" + kind + "_v2";
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationManager nm =
          (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
      nm.createNotificationChannel(
          new NotificationChannel(
              channel,
              kind.equals("meals") ? "Питание" : kind.equals("water") ? "Вода" : "Поддержка",
              NotificationManager.IMPORTANCE_DEFAULT));
      if (nm.getNotificationChannel(channel).getImportance() == NotificationManager.IMPORTANCE_NONE)
        return false;
    }
    String title = item.optString("title"), body = item.optString("body");
    if (stage == 1) {
      title = "Напоминание о приёме пищи";
      body = "Еда ещё не отмечена. Если уже поели — добавьте запись в дневник.";
    }
    if (stage == 2) {
      title = "Приём пищи не отмечен";
      body =
          "Вы пропустили запланированный приём пищи. Если уже поели — отметьте это в дневнике."
              + " Дальше повторов не будет.";
    }
    Intent open =
        new Intent(c, MainActivity.class)
            .setAction("racionika.OPEN." + item.optInt("id"))
            .putExtra("reminderRoute", item.optString("route", "diary"))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent pi =
        PendingIntent.getActivity(
            c,
            300000 + item.optInt("id"),
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    NotificationCompat.Builder notification =
        new NotificationCompat.Builder(c, channel)
            .setSmallIcon(R.drawable.ic_stat_leaf)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER);
    if (kind.equals("meals")) {
      JSONObject displayed = new JSONObject(prefs(c).getString("displayed", "{}"));
      displayed.put(
          String.valueOf(item.optInt("id")),
          new JSONObject().put("occurrence", occurrence).put("stage", stage));
      if (!prefs(c).edit().putString("displayed", displayed.toString()).commit()) return false;
      notification.addAction(0, "Я уже поел", mealAction(c, item, occurrence, ACK));
      notification.addAction(0, "Через 30 минут", mealAction(c, item, occurrence, SNOOZE));
      notification.addAction(0, "Записать еду", pi);
    }
    manager.notify(item.optInt("id"), notification.build());
    return true;
  }

  public static synchronized void syncProgress(Context c, JSONObject progress)
      throws JSONException {
    if (progress.toString().length() > 30000) throw new JSONException("Too much progress");
    if (!prefs(c).edit().putString("progress", progress.toString()).commit())
      throw new IllegalStateException("Storage failed");
    long now = System.currentTimeMillis();
    JSONArray chains = array(prefs(c).getString("chains", "[]"));
    for (int i = 0; i < chains.length(); i++) {
      JSONObject row = chains.optJSONObject(i);
      if (row == null) continue;
      JSONObject item = find(c, row.optInt("id"));
      if (item != null && complete(c, item, row.optLong("occurrence"), now)) {
        clearChain(c, item);
        NotificationManagerCompat.from(c).cancel(item.optInt("id"));
      }
    }
    // Dismiss already displayed water reminders when the day's target is reached.
    JSONArray items = array(prefs(c).getString("items", "[]"));
    for (int i = 0; i < items.length(); i++) {
      JSONObject item = items.optJSONObject(i);
      if (item != null
          && (item.optString("channel").equals("water")
              || item.optString("channel").equals("meals"))
          && complete(c, item, now, now))
        NotificationManagerCompat.from(c).cancel(item.optInt("id"));
    }
  }

  private static JSONObject testItem() throws JSONException {
    return new JSONObject()
        .put("id", 39999)
        .put("channel", "motivation")
        .put("title", "Проверка уведомлений")
        .put("body", "Тестовое уведомление доставлено. Это проверка, не напоминание о еде.")
        .put("route", "settings");
  }

  public static synchronized void testDelivery(Context c) throws JSONException {
    long due = System.currentTimeMillis() + 60000;
    if (!prefs(c).edit().putLong("testAt", due).commit())
      throw new IllegalStateException("Storage failed");
    schedule(c, testItem(), 0, due, due);
  }

  public static synchronized void restore(Context c) {
    long now = System.currentTimeMillis();
    long testAt = prefs(c).getLong("testAt", 0);
    if (testAt > now)
      try {
        schedule(c, testItem(), 0, testAt, testAt);
      } catch (JSONException ignored) {
      }
    JSONArray items = array(prefs(c).getString("items", "[]"));
    for (int i = 0; i < items.length(); i++) {
      JSONObject item = items.optJSONObject(i);
      if (item != null) {
        long n = next(item, now);
        schedule(c, item, 0, n, n);
      }
    }
    JSONArray chains = array(prefs(c).getString("chains", "[]"));
    for (int i = 0; i < chains.length(); i++) {
      JSONObject row = chains.optJSONObject(i);
      if (row == null) continue;
      JSONObject item = find(c, row.optInt("id"));
      if (item == null) continue;
      long due = row.optLong("due"), occurrence = row.optLong("occurrence");
      try {
        if (due > now && allowed(item, due) && !complete(c, item, occurrence, now))
          schedule(c, item, row.optInt("stage"), occurrence, due);
        else clearChain(c, item); // Never flood old notifications after reboot/time changes.
      } catch (JSONException ignored) {
        /* Invalid persisted data cannot create extra alarms. */
      }
    }
  }
}

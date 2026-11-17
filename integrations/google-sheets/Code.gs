/**
 * مزامنة مساجد مكتب أوقاف القره بوللي → Google Sheets
 *
 * طريقة التركيب (مرة واحدة):
 * 1. افتح جدول Google Sheets جديد.
 * 2. من القائمة: الإضافات (Extensions) ← Apps Script.
 * 3. احذف الكود الموجود والصق هذا الملف كاملاً، ثم احفظ (Ctrl+S).
 * 4. ارجع للجدول وحدّث الصفحة، ستظهر قائمة «مساجد القره بوللي».
 * 5. اختر «إعداد الربط (مرة واحدة)» والصق رمز المزامنة (SHEET_SYNC_TOKEN).
 *    وافق على الأذونات التي يطلبها جوجل.
 * بعدها يتحدّث الجدول تلقائياً كل 5 دقائق، ويمكنك الضغط على «مزامنة الآن» في أي وقت.
 */

var SUPABASE_URL = 'https://htfyhhkvqxdjpdjtpnff.supabase.co';
var SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6nhkmTG-_HfX09RJ7Ve3ZQ_U4rnLi92';
var SHEET_NAME = 'المساجد';
var STATUS_SHEET_NAME = 'حالة المزامنة';
var TIME_ZONE = 'Africa/Tripoli';
var SYNC_EVERY_MINUTES = 5;

var HEADERS = [
  'م',
  'اسم المسجد (الرسمي)',
  'الاسم المتداول',
  'المحلة / المنطقة',
  'علامة دالة',
  'ملاحظات',
  'خط العرض',
  'خط الطول',
  'رابط الموقع (خرائط جوجل)',
  'دقة GPS (متر)',
  'عدد الصور',
  'الموثِّق',
  'بريد الموثِّق',
  'تاريخ ووقت التوثيق',
  'آخر تعديل بواسطة',
  'تاريخ ووقت آخر تعديل',
  'معرّف OpenStreetMap',
  'معرّف جوجل (Place ID)',
  'معرّف السجل'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('مساجد القره بوللي')
    .addItem('مزامنة الآن', 'syncMosques')
    .addSeparator()
    .addItem('إعداد الربط (مرة واحدة)', 'setupSync')
    .addToUi();
}

function setupSync() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.prompt(
    'إعداد ربط المساجد',
    'الصق رمز المزامنة (SHEET_SYNC_TOKEN) كما استلمته:',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var token = String(res.getResponseText() || '').trim();
  if (token.length < 32) {
    ui.alert('الرمز غير صحيح، تأكد أنك نسخته كاملاً.');
    return;
  }
  PropertiesService.getScriptProperties().setProperty('SHEET_SYNC_TOKEN', token);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TIME_ZONE);

  // Replace any older triggers, then sync every few minutes.
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncMosques') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncMosques').timeBased().everyMinutes(SYNC_EVERY_MINUTES).create();

  var count = syncMosques();
  ui.alert('تم الربط بنجاح ✅\nعدد المساجد الحالية: ' + count + '\nسيتحدّث الجدول تلقائياً كل ' + SYNC_EVERY_MINUTES + ' دقائق.');
}

function fetchMosques_() {
  var token = PropertiesService.getScriptProperties().getProperty('SHEET_SYNC_TOKEN');
  if (!token) throw new Error('لم يتم إعداد الربط بعد. اختر «إعداد الربط (مرة واحدة)» من القائمة.');

  var response = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/sheet_export', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    payload: JSON.stringify({ p_token: token }),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code === 401 || code === 403) {
    throw new Error('رمز المزامنة غير صحيح أو تم تغييره. أعد «إعداد الربط».');
  }
  if (code !== 200) {
    throw new Error('تعذّر جلب البيانات (HTTP ' + code + '): ' + response.getContentText().slice(0, 300));
  }
  return JSON.parse(response.getContentText());
}

function toDate_(iso) {
  return iso ? new Date(iso) : '';
}

function syncMosques() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return -1;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var status = ss.getSheetByName(STATUS_SHEET_NAME) || ss.insertSheet(STATUS_SHEET_NAME);

  try {
    var rows = fetchMosques_();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME, 0);
    sheet.setRightToLeft(true);

    var values = rows.map(function (m, i) {
      return [
        i + 1,
        m.official_name || '',
        m.common_name || '',
        m.locality || '',
        m.landmark || '',
        m.notes || '',
        m.lat,
        m.lng,
        m.maps_url || '',
        m.accuracy,
        m.photo_count,
        m.created_by_name || '',
        m.created_by_email || '',
        toDate_(m.created_at),
        m.updated_by_name || '',
        toDate_(m.updated_at),
        m.osm_id || '',
        m.google_place_id || '',
        m.id
      ];
    });

    sheet.clearContents();
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setValues([HEADERS])
      .setFontWeight('bold')
      .setBackground('#0F4C3A')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);

    if (values.length > 0) {
      sheet.getRange(2, 1, values.length, HEADERS.length).setValues(values);
      sheet.getRange(2, 7, values.length, 2).setNumberFormat('0.000000');
      sheet.getRange(2, 14, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
      sheet.getRange(2, 16, values.length, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    }

    status.getRange('A1:B3').setValues([
      ['آخر مزامنة', new Date()],
      ['عدد المساجد', values.length],
      ['الحالة', 'ناجحة ✅']
    ]);
    status.getRange('B1').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    return values.length;
  } catch (err) {
    status.getRange('A1:B3').setValues([
      ['آخر محاولة', new Date()],
      ['عدد المساجد', ''],
      ['الحالة', 'فشلت: ' + (err && err.message ? err.message : err)]
    ]);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

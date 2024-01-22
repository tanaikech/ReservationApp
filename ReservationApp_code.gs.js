/**
 * GitHub  https://github.com/tanaikech/ReservationApp<br>
 * 
 * Application name. This name is used in the notification email.
 * @type {string}
 * @const {string}
 * @readonly
 */
const appName = "ReservationApp";

/**
 * ### Description
 * Main function.
 * 
 * @param {Object} object Event object from browser or fetch API.
 * @returns {(ContentService.TextOutput|HtmlService.HtmlOutput)} ContentService.TextOutput or HtmlService.HtmlOutput is returned by depending the input object.
 */
function doGet(e) {
  if (!e) {
    throw new Error("Please access Web Apps with your browser.");
  }
  if (e.parameter && e.parameter.status) {
    // Return TextOutput object.
    const { status } = e.parameter;
    if (status == "init") {
      const obj = getInitializeParameters_();
      moveDataToArchiveSheet_(obj);
      const table = createCalendarAsHTML_(obj);
      const resObj = {
        table,
        explanationOfReservationPage: obj.explanationOfReservationPage,
        agreementsForReservation: obj.agreementsForReservation,
        contactEmail: obj.contactEmail,
      };
      return ContentService.createTextOutput(JSON.stringify(resObj));
    } else if (status == "submit") {
      const obj = JSON.parse(e.parameter.values);
      const res = putValues(obj);
      return ContentService.createTextOutput(JSON.stringify(res));
    }
    return ContentService.createTextOutput(JSON.stringify({ msg: "No value" }));
  }

  // Return HtmlOutput object.
  const obj = getInitializeParameters_();
  moveDataToArchiveSheet_(obj);
  const table = createCalendarAsHTML_(obj);
  const html = HtmlService.createTemplateFromFile("index");
  html.explanationOfReservationPage = obj.explanationOfReservationPage;
  html.table = table;
  html.agreementsForReservation = obj.agreementsForReservation;
  html.contactEmail = obj.contactEmail;
  return html.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ### Description
 * Store the reservation data from Javascript side.
 *
 * @param {Object} obj Object from Javascript side.
 * @return {Object} Object including result values.
 */
function putValues(obj) {
  let res = null;
  const lock = LockService.getScriptLock();
  if (lock.tryLock(350000)) {
    try {
      res = putValues_main_(obj);
    } catch ({ stack }) {
      console.error(stack);
      res = {
        done: false,
        error: { msg: stack },
      };
    } finally {
      lock.releaseLock();
    }
  } else {
    console.error("Timeout");
    res = {
      done: false,
      error: { msg: "Sorry. This reservation process was not done because fo timeout. Please try again." },
    };
  }
  return res;
}


// -------------------------------------------------------------
// Private functions
// -------------------------------------------------------------

/**
 * ### Description
 * Private function.
 * Initialization of this script. When the Spreadsheet for the database is not existing, the Spreadsheet is created.
 * 
 * @returns {Object} Object for using this script.
 */
function initValues_() {
  const p = PropertiesService.getScriptProperties();
  let spreadsheetId = p.getProperty("spreadsheetId");
  let ss, dashboardSheet, dataSheet, archiveSheet;
  if (spreadsheetId) {
    ss = SpreadsheetApp.openById(spreadsheetId);
    dashboardSheet = ss.getSheetByName("dashboard");
    dataSheet = ss.getSheetByName("data");
    archiveSheet = ss.getSheetByName("archive");
  } else {
    ss = SpreadsheetApp.create(`${appName}_database`, 30, 3);
    p.setProperty("spreadsheetId", ss.getId());
    dashboardSheet = ss.getSheets()[0].setName("dashboard");
    dataSheet = ss.insertSheet("data");
    archiveSheet = ss.insertSheet("archive");
    const sampleEmail = Session.getActiveUser().getEmail();
    const initValues = [["variables", "values", "description"], ["contactEmail", sampleEmail, "Email address for contact email from the customers. This is only one email."], ["notificationRecipientEmails", sampleEmail, "Email addresses for notifying when a new reservation is submitted and an error occurs. When you use multiple Emails, please set them separated by a comma."], ["totalSeats", "50", "Total number of seats. This value is the maximum number of reservations."], ["operatingDay", "Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday", "Operating days. Please set them separated by a comma."], ["openingTime", "10:00:00", "Opening time."], ["closingTime", "22:00:00", "Closing time."], ["averageMealTime_min", "120", "Average meal time. Unit is minutes."], ["step_min", "30", "Step time. Unit is minutes."], ["maximumResevation_month", "2", "Maximum reservation month. If 2 is set, the reservation can be done from today until 2 months."], ["explanationOfReservationPage", "Reservation page", "Title of reservation page."], ["agreementsForReservation", "Sample agreements for reservation. For example, the rule of cancel.", "Agreements for reservation."]];
    dashboardSheet.getRange(1, 1, initValues.length, initValues[0].length).setValues(initValues);
    dashboardSheet.getRange(1, 1, 1, initValues[0].length).setBackground("#b6d7a8");
    dashboardSheet.autoResizeColumns(1, 3);
  }
  const today = new Date();
  const colorObj = { headers: "#1565c0", empty: "#c5e1a5", holiday: "#f44336", private: "#ffb74d" };
  return { ss, dashboardSheet, dataSheet, archiveSheet, today, colorObj };
}

/**
 * ### Description
 * Private function.
 * Retrieve values from Spreadsheet and create an object.
 * 
 * @returns {Object} Object including the values of Spreadsheet.
 */
function getInitializeParameters_() {
  const parseStrToAr_ = (str, delimiter = ",") => str != "" ? str.split(delimiter).map(f => f.trim()) : [];

  const v = initValues_();
  const { ss, dashboardSheet, today, colorObj } = v;
  const timeZone = ss.getSpreadsheetTimeZone();
  const values = dashboardSheet.getRange("A2:B" + dashboardSheet.getLastRow()).getDisplayValues();
  const obj = values.reduce((o, [a, b]) => {
    if (["openingTime", "closingTime"].includes(a)) {
      const s = b.split(":");
      if (s.length == 3) {
        b = s.splice(0, 2).join(":");
      }
    }
    o[a] = isNaN(b) ? b : Number(b);
    return o;
  }, { ...v, timeZone, today, colorObj });
  const openingTime = obj.openingTime || "10:00";
  const closingTime = obj.closingTime || "20:00";
  let o = Utilities.parseDate(openingTime, timeZone, "HH:mm").getTime();
  let c = Utilities.parseDate(closingTime, timeZone, "HH:mm").getTime();
  c -= obj.averageMealTime_min * 60 * 1000;
  const kk = ((c - o) / (60 * 1000)) / obj.step_min;
  const ar = [Utilities.formatDate(new Date(o), timeZone, "HH:mm")];
  for (let i = 0; i < kk; i++) {
    o += obj.step_min * 60 * 1000;
    ar.push(Utilities.formatDate(new Date(o), timeZone, "HH:mm"));
  }
  obj.openToCloseTimes = ar;
  const maximumResevation_month = obj.maximumResevation_month || 2;
  const temp = new Date(today);
  temp.setMonth(temp.getMonth() + Number(maximumResevation_month));
  obj.fromDate = Utilities.formatDate(today, timeZone, "yyyy-MM-dd");
  obj.toDate = Utilities.formatDate(temp, timeZone, "yyyy-MM-dd");
  obj.refWeekDays = [...Array(7)].map((_, i) => Utilities.formatDate(new Date(2000, 1, i - 1), timeZone, "EEEE"));
  obj.operatingDay = parseStrToAr_(obj.operatingDay);
  obj.notificationRecipientEmails = parseStrToAr_(obj.notificationRecipientEmails);
  return obj;
}

/**
 * ### Description
 * Private function.
 * Create a reservation calendar.
 * 
 * @returns {String} The reservation calendar is returned as HTML table.
 */
function createCalendarAsHTML_(obj) {
  const { reservedData, temporaryHolidays } = getReservations_(obj);
  obj.reservations = reservedData;
  obj.temporaryHolidays = temporaryHolidays;
  return createCalendar_(obj);
}

/**
 * ### Description
 * Private function.
 * Create a reservation calendar.
 *
 * @param {Object} object Object for running script.
 * @returns {String} The reservation calendar is returned as HTML table.
 */
function createCalendar_({ reservations, timeZone, averageMealTime_min, operatingDay, maximumResevation_month, temporaryHolidays, openToCloseTimes, today, colorObj }) {
  const ar = openToCloseTimes;
  const tempToday = new Date(today);
  tempToday.setHours(0, 0, 0, 0);
  const endDay = new Date(tempToday);
  endDay.setMonth(endDay.getMonth() + maximumResevation_month);
  tempToday.setDate(tempToday.getDate() + 1); // Start day is tomorrow.
  const res = [];
  const s = tempToday.getTime();
  const e = endDay.getTime();
  for (let i = s; i <= e; i += (24 * 60 * 60 * 1000)) {
    const date = new Date(i);
    let holiday = false;
    const weekStr = Utilities.formatDate(date, timeZone, "EEEE");
    const dateStr = Utilities.formatDate(date, timeZone, "yyyy-MM-dd");
    if (!operatingDay.includes(weekStr) || temporaryHolidays.includes(dateStr)) {
      holiday = true;
    }
    res.push({ dateStr, date, holiday });
  }
  const ar_include_start_end = ar.map(start => {
    const t_obj = Utilities.parseDate(start, timeZone, "HH:mm").getTime();
    const end_unix = t_obj + (averageMealTime_min * 60 * 1000);
    const end = Utilities.formatDate(new Date(end_unix), timeZone, "HH:mm");
    return { start, end };
  });
  let yearMonthCheck = "";
  const trs = res.map(({ dateStr, date, holiday }) => {
    let yearMonth = Utilities.formatDate(date, timeZone, "MMMM yyyy");
    if (yearMonth != yearMonthCheck) {
      yearMonthCheck = yearMonth;
      yearMonth = `<tr style='background-color: ${colorObj.headers};color:#ffffff'><td>${yearMonth}</td>${ar.map(t => `<td>${t}</td>`).join("")}</tr>`;
    } else {
      yearMonth = "";
    }
    let reserved;
    if (reservations[dateStr]) {
      reserved = ar_include_start_end.map(({ start, end }) => {
        const temp1 = reservations[dateStr].find(({ time }) => time == start);
        if (temp1) {
          if (temp1.remainingSeats == 0) {
            return `<td style="background-color: ${colorObj.private};" value='${JSON.stringify({ date: dateStr, startTime: start, endTime: end, remainingSeats: 0 })}' data-target="modal1"><i class="material-icons">close</i></td>`;
          }
          return `<td style="background-color: ${colorObj.empty};"><a class="reserve-btn btn-flat waves-effect modal-trigger" value='${JSON.stringify({ date: dateStr, startTime: start, endTime: end, remainingSeats: temp1.remainingSeats })}' data-target="modal1">${temp1.remainingSeats}</a></td>`;
        }
        return `<td style="background-color: ${colorObj.empty};"><a class="reserve-btn btn-flat waves-effect modal-trigger" value='${JSON.stringify({ date: dateStr, startTime: start, endTime: end, remainingSeats: 50 })}' data-target="modal1">50</a></td>`;
      });
    } else {
      reserved = ar_include_start_end.map(({ start, end }) => `<td style="background-color: ${colorObj.empty};"><a class="reserve-btn btn-flat waves-effect modal-trigger" value='${JSON.stringify({ date: dateStr, startTime: start, endTime: end, remainingSeats: 50 })}' data-target="modal1">50</a></td>`);
    }
    if (holiday) {
      return yearMonth + `<tr style='background-color: ${colorObj.holiday};'>` + [`<td style='background-color: ${colorObj.headers};color:#ffffff'>${Utilities.formatDate(date, timeZone, "dd")}</td>`, ...ar.map(_ => `<td></td>`)].join("") + "</tr>";
    }
    return yearMonth + "<tr>" + [`<td style='background-color: ${colorObj.headers};color:#ffffff'>${Utilities.formatDate(date, timeZone, "dd")}</td>`, ...reserved].join("") + "</tr>";
  }).join("");
  const tbody = `<tbody>${trs}</tbody>`
  const head = ""; // Currently empty.
  const table = `<table class="bordered striped highlight centered" border="1" cellspacing="0">${head}${tbody}</table>`;
  return table;
}

/**
 * ### Description
 * Private function.
 * Get current reservations.
 *
 * @param {Object} object Object for running script.
 * @returns {Object} Object including the reservation data and the holiday data.
 */
function getReservations_({ dataSheet, timeZone, totalSeats, openToCloseTimes, contactEmail, notificationRecipientEmails }) {
  const dupCheckValues_ = (baseAr, dupCheckValues) =>
    baseAr.reduce((oo, r) => {
      const st = r.start.getTime();
      const et = r.end.getTime();
      if (dupCheckValues.some(o => (o.start.getTime() <= st && st < o.end.getTime()) || (o.start.getTime() <= et && et < o.end.getTime()))) {
        oo.dup.push(r);
      } else {
        oo.nondup.push(r);
      }
      return oo;
    }, { nondup: [], dup: [] });

  let [headers, ...values] = dataSheet.getDataRange().getValues();
  const statusIdx = headers.indexOf("status");
  values = values.filter(r => !r[statusIdx].toLowerCase().includes("cancel")); // or values = values.filter(r => r[statusIdx].toLowerCase() != "cancel");
  const evv = values.map(r => headers.reduce((o, h, j) => (o[h] = r[j], o), {}));
  const reservationData = evv.filter(r => !r.status);
  const temporaryHolidays = evv.filter(r => r.status == "temporaryHoliday").map(o => {
    const start = o.start;
    start.setHours(0, 0, 0, 0);
    const end = o.end;
    end.setHours(0, 0, 0, 0);
    o.start = start;
    o.end = end;
    return o;
  }).sort((a, b) => a.start.getTime() > b.start.getTime() ? 1 : -1);
  const reservedDayTimes = evv.filter(r => r.status == "reservedDayTime").map(o => (o.numberPersons = totalSeats, o)).sort((a, b) => a.start.getTime() > b.start.getTime() ? 1 : -1);
  const checkDup1 = dupCheckValues_(reservedDayTimes, temporaryHolidays);
  const checkDup2 = dupCheckValues_(reservationData, [...temporaryHolidays, ...reservedDayTimes]);
  if (checkDup1.dup.length > 0 || checkDup2.dup.length > 0) {
    const dupValues = [...checkDup1.dup, ...checkDup2.dup];
    const body = `Warning: 'temporaryHolidays' or 'reservedDayTime' are double bookined to the user's reserved days. Please confirm the data sheet. The duplicated reservations are as follows.\n\n${JSON.stringify(dupValues, null, 2)}.`;
    console.warn(body);
    sendMail_({
      to: contactEmail,
      subject: `${appName}: Warning`,
      body,
      cc: notificationRecipientEmails.length > 0 ? notificationRecipientEmails.join(",") : null,
    });
  }
  const ev = [...checkDup2.nondup, ...reservedDayTimes].sort((a, b) => a.start.getTime() > b.start.getTime() ? 1 : -1);
  const evObj = [...ev.reduce((m, o) => {
    const d = Utilities.formatDate(o.start, timeZone, "yyyy-MM-dd");
    return m.set(d, m.has(d) ? [...m.get(d), o] : [o]);
  }, new Map())];
  const reservedData = evObj.reduce((o, [k, v]) => {
    const dates = openToCloseTimes.map(e => {
      const t = new Date(`${k}T${e}:00`).getTime();
      let aa = 0;
      let statusType = "";
      const rr = v.reduce((a, { start, end, numberPersons, status }) => {
        if (start.getTime() <= t && t < end.getTime()) {
          a += numberPersons;
          statusType = status;
        }
        return a;
      }, aa);
      const temp1 = { reservedSeats: rr, remainingSeats: totalSeats - rr, totalSeats, date: k, time: e, dateISO: new Date(`${k}T${e}:00`).toISOString() };
      if (statusType != "") {
        temp1.status = statusType;
      }
      return temp1;
    });
    o[k] = dates;
    return o;
  }, {});
  const convertedTemporaryHolidays = temporaryHolidays.flatMap(o =>
    [...Array(o.end.getDate() - o.start.getDate() + 1)].map((_, i) => {
      const tempDay = new Date(o.start);
      tempDay.setDate(tempDay.getDate() + i);
      return Utilities.formatDate(tempDay, timeZone, "yyyy-MM-dd");
    }));
  return { reservedData, temporaryHolidays: convertedTemporaryHolidays };
}

/**
 * ### Description
 * Private function.
 * Move old data to archive sheet.
 *
 * @param {Object} object Object for running script.
 * @return {void}
 */
function moveDataToArchiveSheet_({ dataSheet, archiveSheet, today }) {
  const day = new Date(today);
  day.setHours(0, 0, 0, 0);
  const todayUnix = day.getTime();
  const [header, ...values] = dataSheet.getDataRange().getValues();
  const startCol = header.indexOf("start");
  const obj = values.reduce((o, r) => {
    if (r[startCol].getTime() < todayUnix) {
      o.dst.push(r);
    } else {
      o.src.push(r);
    }
    return o;
  }, { src: [header], dst: [] });
  if (obj.dst.length == 0) return;
  if (archiveSheet.getRange("A1").isBlank()) {
    obj.dst.unshift(header);
  }
  archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, obj.dst.length, obj.dst[0].length).setValues(obj.dst);
  dataSheet.clearContents().getRange(1, 1, obj.src.length, obj.src[0].length).setValues(obj.src);
}

/**
 * ### Description
 * Private function.
 * Store the reservation data from Javascript side.
 *
 * @param {Object} obj Object from Javascript side.
 * @return {Object} Object including result values.
 */
function putValues_main_(obj) {
  const dupCheckSubmitValue_1_ = (obj, submitValue) => {
    const start = new Date(`${submitValue.reservedDateTime.date}T${submitValue.reservedDateTime.startTime}`).getTime();
    const end = new Date(`${submitValue.reservedDateTime.date}T${submitValue.reservedDateTime.endTime}`).getTime();
    const [headers, ...values] = obj.dataSheet.getDataRange().getValues();
    const evv = values.map(r => headers.reduce((o, h, j) => (o[h] = r[j], o), {}));
    const res = evv.filter(e => (e.email == submitValue.email && `'${e.phone}` == submitValue.phone) && ((e.start.getTime() <= start && start < e.end.getTime()) || (e.start.getTime() <= end && end < e.end.getTime())) && !e.status.toLowerCase().includes("cancel"));
    return res.length > 0 ? true : false;
  }
  const initObj = getInitializeParameters_();
  const retObj = {};
  if (dupCheckSubmitValue_1_(initObj, obj)) {
    retObj.done = false;
    retObj.error = { msg: `Your submitted reservation is duplicated from the reservation you have already made. Please confirm your reservation date and times, again.` };
    return retObj;
  }
  obj.start = new Date(`${obj.reservedDateTime.date}T${obj.reservedDateTime.startTime}`);
  obj.end = new Date(`${obj.reservedDateTime.date}T${obj.reservedDateTime.endTime}`);
  let o = Utilities.parseDate(obj.reservedDateTime.startTime, initObj.timeZone, "HH:mm").getTime();
  let c = Utilities.parseDate(obj.reservedDateTime.endTime, initObj.timeZone, "HH:mm").getTime();
  const kk = ((c - o) / (60 * 1000)) / initObj.step_min;
  const ar = [Utilities.formatDate(new Date(o), initObj.timeZone, "HH:mm")];
  for (let i = 0; i < kk; i++) {
    o += initObj.step_min * 60 * 1000;
    ar.push(Utilities.formatDate(new Date(o), initObj.timeZone, "HH:mm"));
  }
  const currentReservations = getReservations_(initObj);
  if (currentReservations.reservedData[obj.reservedDateTime.date]) {
    const t = currentReservations.reservedData[obj.reservedDateTime.date].filter(({ remainingSeats, time }) => ar.some(f => time == f && remainingSeats - obj.numberPersons < 0));
    if (t.length > 0) {
      retObj.done = false;
      retObj.error = { msg: `We cannot accept reservations from ${obj.reservedDateTime.startTime} to ${obj.reservedDateTime.endTime} on ${obj.reservedDateTime.date}. Please reload the page and reserve other time or date.`, res: t };
      return retObj;
    }
  }

  const body = [
    "--- Reservation information ---",
    "",
    `Date: ${Utilities.formatDate(obj.start, initObj.timeZone, "yyyy-MM-dd HH:mm")} to ${Utilities.formatDate(obj.end, initObj.timeZone, "yyyy-MM-dd HH:mm")}`,
    `Reserved seats: ${obj.numberPersons}`,
    `Name: ${obj.name}`,
    `Email: ${obj.email}`,
    `Phone: ${obj.phone}`,
    `Comment: ${obj.comment}`,
  ];
  try {
    sendMail_({
      to: obj.email,
      subject: "Reservation information",
      body: body.join("\n"),
      bcc: initObj.notificationRecipientEmails.length > 0 ? initObj.notificationRecipientEmails.join(",") : null,
    });
  } catch ({ stack, message }) {
    sendMail_({
      to: initObj.contactEmail,
      subject: `${appName}: Warning`,
      body: `An error occurs at the email "${obj.email}". JSON.stringify({stack, message})`,
      cc: initObj.notificationRecipientEmails.length > 0 ? initObj.notificationRecipientEmails.join(",") : null,
    });
    retObj.done = false;
    retObj.error = { msg: `"${obj.email}" is an invalid email. Please confirm it, and reload the page and reserve other time or date.` };
    return retObj;
  }
  const header = ["date", "name", "email", "phone", "numberPersons", "start", "end", "status", "comment"];
  const lastRow = initObj.dataSheet.getLastRow();
  const values = [...(lastRow == 0 ? [header] : []), header.map(h => h == "date" ? new Date() : obj[h])];
  initObj.dataSheet.getRange(lastRow + 1, 1, values.length, values[0].length).setValues(values);
  SpreadsheetApp.flush();
  retObj.done = true;
  retObj.newTable = createCalendarAsHTML_(initObj);
  return retObj;
}

/**
 * ### Description
 * Private function.
 * Send email.
 *
 * @param {Object} mailObj Object including email data.
 * @return {void}
 */
function sendMail_(mailObj) {
  MailApp.sendEmail(mailObj);
}

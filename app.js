(function () {
  var APIS = ["/.netlify/functions/baza", "/api/baza"];
  var UPLOADS = ["/.netlify/functions/upload", "/api/upload"];
  var LS = "vx-baza-jobs";
  var MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  function $(id) { return document.getElementById(id); }
  var currentFiles = [];
  var showAll = false;
  var editId = null;
  var hideList = false;
  var JOBS = [];
  var saving = false;
  var TYPES = ["Частник","Бюро","Застройщик","Дизайнер","Другое"];
  var CATS = ["Экстерьер","Интерьер","Посёлок / территория","Склад / цех","Чертежи / проект","Другое"];

  function load() { return JOBS.slice(); }
  function persistLocal(arr) {
    try { localStorage.setItem(LS, JSON.stringify(arr)); } catch (e) {}
  }
  function readLocal() {
    try {
      var raw = localStorage.getItem(LS);
      var local = raw ? JSON.parse(raw) : [];
      return Array.isArray(local) ? local : [];
    } catch (e) {
      return [];
    }
  }
  function slimFiles(files) {
    var out = [];
    for (var i = 0; i < (files || []).length; i++) {
      var f = files[i];
      if (!f) continue;
      var url = f.url || "";
      if (!url) continue;
      out.push({ name: f.name || "file", type: f.type || "application/octet-stream", url: url });
    }
    return out;
  }
  function slimJobs(arr) {
    var out = [];
    for (var i = 0; i < (arr || []).length; i++) {
      var j = arr[i] || {};
      var copy = {
        id: j.id,
        name: j.name || "",
        type: j.type || "",
        category: j.category || "",
        title: j.title || "",
        date: j.date || "",
        price: Number(j.price) || 0,
        phone: j.phone || "",
        tg: j.tg || "",
        email: j.email || "",
        note: j.note || "",
        files: slimFiles(j.files)
      };
      out.push(copy);
    }
    return out;
  }
  async function saveRemote(arr) {
    var body = JSON.stringify({ jobs: slimJobs(arr) });
    if (body.length > 450000) throw new Error("size");
    var last = null;
    for (var i = 0; i < APIS.length; i++) {
      try {
        var r = await fetch(APIS[i], {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: body
        });
        if (r.ok) return true;
        last = new Error("network " + r.status);
      } catch (e) {
        last = e;
      }
    }
    throw last || new Error("network");
  }
  async function saveAll(arr) {
    JOBS = slimJobs(arr);
    persistLocal(JOBS);
    await saveRemote(JOBS);
  }
  async function pullRemote() {
    var reads = APIS.concat(["https://json.extendsclass.com/bin/baabbfe"]);
    for (var i = 0; i < reads.length; i++) {
      try {
        var url = reads[i] + (reads[i].indexOf("?") === -1 ? "?t=" + Date.now() : "&t=" + Date.now());
        var r = await fetch(url);
        if (!r.ok) continue;
        var d = await r.json();
        if (d && Array.isArray(d.jobs)) return d.jobs;
      } catch (e) {}
    }
    return null;
  }
  function mergeJobs(a, b) {
    var map = {};
    function score(j) {
      return JSON.stringify(j || {}).length + ((j && j.files && j.files.length) ? 1000 : 0);
    }
    function add(list) {
      for (var i = 0; i < (list || []).length; i++) {
        var j = list[i];
        if (!j || !j.id || j.id === "ping" || j.name === "ping") continue;
        if (!map[j.id] || score(j) >= score(map[j.id])) map[j.id] = j;
      }
    }
    add(a);
    add(b);
    var out = [];
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) out.push(map[k]);
    return out;
  }
  async function pull() {
    var remote = await pullRemote();
    var local = readLocal();
    JOBS = slimJobs(mergeJobs(remote, local));
    persistLocal(JOBS);
    try {
      if (await migrateEmbedded(JOBS)) await saveAll(JOBS);
      else if (JOBS.length && (!remote || remote.length < JOBS.length)) await saveRemote(JOBS);
    } catch (e) {}
  }
  async function refreshFromCloud() {
    if (saving || editId) return;
    var remote = await pullRemote();
    if (!remote) return;
    JOBS = slimJobs(mergeJobs(remote, JOBS.length ? JOBS : readLocal()));
    persistLocal(JOBS);
    render();
  }
  function money(n) { return (Number(n) || 0).toLocaleString("ru-RU") + " ₽"; }

  function fileSrc(f) {
    return (f && (f.url || f.data)) || "";
  }
  function setFileStatus(text) {
    if ($("fileStatus")) $("fileStatus").textContent = text;
  }
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  async function postUpload(url, headers, body) {
    var r = await fetch(url, { method: "POST", headers: headers, body: body });
    if (r.status === 413) throw new Error("too-big");
    if (!r.ok) throw new Error("upload " + r.status);
    var d = await r.json();
    if (!d || !d.url) throw new Error("upload");
    return d;
  }
  async function uploadBlob(name, type, blob) {
    var last = null;
    var q = "?name=" + encodeURIComponent(name || "file") + "&type=" + encodeURIComponent(type || "application/octet-stream");
    for (var i = 0; i < UPLOADS.length; i++) {
      try {
        var d = await postUpload(UPLOADS[i] + q, { "Content-Type": type || "application/octet-stream" }, blob);
        return { name: name, type: type, url: d.url };
      } catch (e) { last = e; }
    }
    var dataUrl = await blobToDataUrl(blob);
    var payload = JSON.stringify({ name: name, type: type, data: dataUrl });
    for (var k = 0; k < UPLOADS.length; k++) {
      try {
        var d2 = await postUpload(UPLOADS[k], { "Content-Type": "text/plain" }, payload);
        return { name: name, type: type, url: d2.url };
      } catch (e2) { last = e2; }
    }
    if (last && last.message === "too-big") throw last;
    throw new Error("upload");
  }
  function dataToBlob(dataUrl) {
    return fetch(dataUrl).then(function (r) { return r.blob(); });
  }
  async function uploadFile(item) {
    if (!item) return null;
    if (item.url) return { name: item.name, type: item.type, url: item.url };
    if (item.blob) return uploadBlob(item.name, item.type, item.blob);
    if (item.data) {
      var blob = await dataToBlob(item.data);
      return uploadBlob(item.name, item.type || blob.type, blob);
    }
    return null;
  }
  async function uploadAll(files) {
    var out = [];
    for (var i = 0; i < (files || []).length; i++) {
      var f = files[i];
      if (f && f.url) out.push({ name: f.name, type: f.type, url: f.url });
      else {
        var up = await uploadFile(f);
        if (up) out.push(up);
      }
    }
    return out;
  }
  function compressImage(file) {
    return new Promise(function (resolve) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.width, h = img.height, max = 1600;
        if (w > max || h > max) {
          var k = max / Math.max(w, h);
          w = Math.round(w * k);
          h = Math.round(h * k);
        }
        var c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (!blob) { resolve(null); return; }
          resolve({
            name: String(file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg",
            type: "image/jpeg",
            blob: blob
          });
        }, "image/jpeg", 0.7);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  async function prepareFile(file) {
    if (!file) return null;
    if ((file.type || "").indexOf("image/") === 0) return compressImage(file);
    if (file.size > 7000000) {
      alert("Файл «" + file.name + "» больше 7 МБ. Сожмите его и попробуйте снова.");
      return null;
    }
    return { name: file.name, type: file.type || "application/octet-stream", blob: file };
  }
  async function addPickedFiles(list, targetArr) {
    var files = [];
    for (var i = 0; i < list.length; i++) files.push(list[i]);
    if (!files.length) return targetArr;
    for (var k = 0; k < files.length; k++) {
      setFileStatus("Загрузка " + (k + 1) + " из " + files.length + "…");
      try {
        var prepared = await prepareFile(files[k]);
        if (!prepared) continue;
        var up = await uploadFile(prepared);
        if (up) targetArr.push(up);
      } catch (err) {
        if (err && err.message === "too-big") {
          alert("Файл «" + files[k].name + "» слишком большой для загрузки.");
        } else {
          alert("Не удалось загрузить «" + files[k].name + "». Облачные функции сайта не отвечают. Залейте архив VisualX_Baza_cloud.zip на Netlify целиком (с папкой netlify/functions).");
        }
      }
    }
    setFileStatus("Можно прикрепить несколько фото и документов к каждой карточке.");
    return targetArr;
  }
  async function migrateEmbedded(arr) {
    var changed = false;
    for (var i = 0; i < (arr || []).length; i++) {
      var files = arr[i].files || [];
      var next = [];
      for (var k = 0; k < files.length; k++) {
        var f = files[k];
        if (f && f.url) {
          next.push({ name: f.name, type: f.type, url: f.url });
        } else if (f && f.data) {
          try {
            var up = await uploadFile(f);
            if (up) {
              next.push(up);
              changed = true;
            }
          } catch (e) {
            changed = true;
          }
        }
      }
      if (next.length !== files.length) changed = true;
      arr[i].files = next;
    }
    return changed;
  }

  function fillSelects() {
    var keepY = $("year").value;
    var keepM = $("month").value;
    var yHtml = "";
    for (var y = 2026; y <= 2032; y++) yHtml += "<option value=\"" + y + "\">" + y + "</option>";
    $("year").innerHTML = yHtml;
    var mHtml = "";
    for (var i = 0; i < 12; i++) {
      var mm = (i + 1 < 10 ? "0" : "") + (i + 1);
      mHtml += "<option value=\"" + mm + "\">" + MONTHS[i] + "</option>";
    }
    $("month").innerHTML = mHtml;
    $("year").value = keepY || "2026";
    $("month").value = keepM || "09";
  }

  function readForm() {
    return {
      id: $("id").value || String(Date.now()),
      name: $("name").value.trim(),
      type: $("type").value,
      category: $("category").value,
      title: $("title").value.trim(),
      date: $("date").value,
      price: Number($("price").value || 0),
      phone: $("phone").value.trim(),
      tg: $("tg").value.trim(),
      email: $("email").value.trim(),
      note: $("note").value.trim(),
      files: currentFiles.slice()
    };
  }

  function clearForm() {
    $("id").value = "";
    $("name").value = "";
    $("title").value = "";
    $("price").value = "";
    $("phone").value = "";
    $("tg").value = "";
    $("email").value = "";
    $("note").value = "";
    $("type").value = "Частник";
    $("category").value = "Экстерьер";
    $("date").value = ($("year").value || "2026") + "-" + ($("month").value || "09") + "-01";
    currentFiles = [];
    if ($("formTitle")) $("formTitle").textContent = "НОВАЯ КАРТОЧКА";
    drawFiles();
  }

  function loadForm(job) {
    $("id").value = job.id;
    $("name").value = job.name || "";
    $("type").value = job.type || "Частник";
    $("category").value = job.category || "Экстерьер";
    $("title").value = job.title || "";
    $("date").value = job.date || "";
    $("price").value = job.price || "";
    $("phone").value = job.phone || "";
    $("tg").value = job.tg || "";
    $("email").value = job.email || "";
    $("note").value = job.note || "";
    currentFiles = (job.files || []).slice();
    if ($("formTitle")) $("formTitle").textContent = "ИЗМЕНЕНИЕ КАРТОЧКИ";
    drawFiles();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  }

  function drawFiles() {
    var pics = "";
    var list = "";
    for (var i = 0; i < currentFiles.length; i++) {
      var f = currentFiles[i];
      if ((f.type || "").indexOf("image/") === 0) pics += "<img src=\"" + fileSrc(f) + "\" alt=\"\" />";
      list += "<div><a href=\"" + fileSrc(f) + "\" download=\"" + esc(f.name) + "\">" + esc(f.name) + "</a><span class=\"delx\" data-i=\"" + i + "\">удалить</span></div>";
    }
    $("preview").innerHTML = pics;
    $("filelist").innerHTML = list;
  }

  function match(job) {
    var q = $("q").value.toLowerCase().replace(/\s/g, "");
    if (!q) return true;
    var blob = [job.name, job.phone, job.email].join(" ").toLowerCase().replace(/\s/g, "");
    return blob.indexOf(q) !== -1;
  }

  function opts(list, cur) {
    var h = "";
    for (var i = 0; i < list.length; i++) {
      h += "<option" + (list[i] === cur ? " selected" : "") + ">" + esc(list[i]) + "</option>";
    }
    return h;
  }

  function cardPics(j, canRemove) {
    var files = j.files || [];
    var pics = "";
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var inner = "";
      if ((f.type || "").indexOf("image/") === 0) {
        inner = "<img src=\"" + fileSrc(f) + "\" alt=\"" + esc(f.name) + "\" data-file=\"" + j.id + "\" data-idx=\"" + i + "\" />";
      } else {
        inner = "<div class=\"filechip\" data-file=\"" + j.id + "\" data-idx=\"" + i + "\">" + esc(f.name) + "</div>";
      }
      if (canRemove) {
        pics += "<div class=\"thumb\">" + inner +
          "<button class=\"xrm\" type=\"button\" data-rmfile=\"" + j.id + "\" data-idx=\"" + i + "\">×</button></div>";
      } else pics += inner;
    }
    return pics ? "<div class=\"gallery\">" + pics + "</div>" : "";
  }

  function card(j) {
    if (editId === j.id) {
      return "<article class=\"item opened\" data-card=\"" + j.id + "\"><div class=\"item-top\"><div class=\"open\" data-open=\"" + j.id + "\"><b>" +
        esc(j.name || "Без имени") + "</b><div class=\"meta\">редактирование</div><div class=\"sum\">" + money(j.price) +
        "</div></div></div><div class=\"details\"><div class=\"kv\">" +
        "<span>Заказчик</span><input data-f=\"name\" value=\"" + esc(j.name) + "\" />" +
        "<span>Тип клиента</span><select data-f=\"type\">" + opts(TYPES, j.type) + "</select>" +
        "<span>Категория проекта</span><select data-f=\"category\">" + opts(CATS, j.category) + "</select>" +
        "<span>Объект</span><input data-f=\"title\" value=\"" + esc(j.title) + "\" />" +
        "<span>Дата договорённости</span><input data-f=\"date\" type=\"date\" value=\"" + esc(j.date) + "\" />" +
        "<span>Сумма договора</span><input data-f=\"price\" type=\"number\" min=\"0\" step=\"100\" value=\"" + (j.price || 0) + "\" />" +
        "<span>Телефон</span><input data-f=\"phone\" value=\"" + esc(j.phone) + "\" />" +
        "<span>Telegram</span><input data-f=\"tg\" value=\"" + esc(j.tg) + "\" />" +
        "<span>Почта</span><input data-f=\"email\" value=\"" + esc(j.email) + "\" />" +
        "<span>Заметка</span><textarea data-f=\"note\">" + esc(j.note) + "</textarea>" +
        "</div>" + cardPics(j, true) +
        "<label>Добавить файлы</label><input type=\"file\" multiple accept=\"image/*,.pdf,.zip,.doc,.docx\" data-addfile=\"" + j.id + "\" />" +
        "<div class=\"bar\" style=\"margin-top:12px\"><button class=\"btn\" type=\"button\" data-save=\"" + j.id + "\">Сохранить</button></div>" +
        "</div></article>";
    }
    return "<article class=\"item\" data-card=\"" + j.id + "\"><div class=\"item-top\"><div class=\"open\" data-open=\"" + j.id + "\"><b>" +
      esc(j.name || "Без имени") + "</b><div class=\"meta\">" +
      esc([j.type, j.category, j.title].filter(Boolean).join(" · ")) +
      "</div><div class=\"sum\">" + money(j.price) +
      "</div></div><div><button class=\"btn-edit\" type=\"button\" data-edit=\"" + j.id + "\">Изменить</button> " +
      "<button class=\"btn-del\" type=\"button\" data-del=\"" + j.id + "\">Удалить</button></div></div>" +
      "<div class=\"details\"><div class=\"kv\">" +
      "<span>Заказчик</span><b>" + esc(j.name) + "</b>" +
      "<span>Тип клиента</span><b>" + esc(j.type) + "</b>" +
      "<span>Категория проекта</span><b>" + esc(j.category) + "</b>" +
      "<span>Объект</span><b>" + esc(j.title) + "</b>" +
      "<span>Дата договорённости</span><b>" + esc(j.date) + "</b>" +
      "<span>Сумма договора</span><b>" + money(j.price) + "</b>" +
      "<span>Телефон</span><b>" + esc(j.phone) + "</b>" +
      "<span>Telegram</span><b>" + esc(j.tg) + "</b>" +
      "<span>Почта</span><b>" + esc(j.email) + "</b>" +
      "<span>Заметка</span><b>" + esc(j.note) + "</b>" +
      "</div>" + cardPics(j, false) +
      "</div></article>";
  }

  function render() {
    var jobs = load();
    var y = $("year").value;
    var m = $("month").value;
    var monthJobs = [];
    var yearJobs = [];
    var i;
    for (i = 0; i < jobs.length; i++) {
      var d = jobs[i].date || "";
      if (d.slice(0, 4) === y) yearJobs.push(jobs[i]);
      if (d.slice(0, 7) === y + "-" + m && match(jobs[i])) monthJobs.push(jobs[i]);
    }
    $("lblMonth").textContent = MONTHS[Number(m) - 1] + " " + y;
    $("lblYear").textContent = "Год " + y;
    var sm = 0, sy = 0;
    for (i = 0; i < monthJobs.length; i++) sm += Number(monthJobs[i].price) || 0;
    for (i = 0; i < yearJobs.length; i++) sy += Number(yearJobs[i].price) || 0;
    $("sumMonth").textContent = money(sm);
    $("sumYear").textContent = money(sy);
    if (hideList) {
      $("list").innerHTML = "";
      return;
    }

    var q = $("q").value.trim();
    var show = [];
    if (q) {
      for (i = 0; i < jobs.length; i++) if (match(jobs[i])) show.push(jobs[i]);
    } else if (showAll) {
      show = jobs.slice();
    } else show = monthJobs;
    show.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });

    if (!show.length) {
      $("list").innerHTML = "<p class=\"meta\">Пока нет заказчиков.</p>";
      return;
    }
    if (q || showAll) {
      var groups = {};
      for (i = 0; i < show.length; i++) {
        var key = (show[i].date || "").slice(0, 7) || "без даты";
        if (!groups[key]) groups[key] = [];
        groups[key].push(show[i]);
      }
      var keys = Object.keys(groups).sort().reverse();
      var html = "";
      for (i = 0; i < keys.length; i++) {
        var p = keys[i].split("-");
        var title = p[1] ? MONTHS[Number(p[1]) - 1] + " " + p[0] : keys[i];
        html += "<div class=\"month\">" + title + "</div>";
        for (var k = 0; k < groups[keys[i]].length; k++) html += card(groups[keys[i]][k]);
      }
      $("list").innerHTML = html;
    } else {
      var html2 = "<div class=\"month\">" + MONTHS[Number(m) - 1] + " " + y + "</div>";
      for (i = 0; i < show.length; i++) html2 += card(show[i]);
      $("list").innerHTML = html2;
    }
  }

  $("saveBtn").onclick = async function () {
    if (saving) return;
    var job = readForm();
    if (!job.name) { alert("Укажите заказчика"); return; }
    if (!job.date) { alert("Укажите дату договорённости"); return; }
    saving = true;
    $("saveBtn").textContent = "Сохранение...";
    $("saveBtn").disabled = true;
    try {
      job.files = await uploadAll(job.files);
    } catch (upErr) {
      alert("Не удалось загрузить файлы. Карточка не сохранена в общую базу.");
      $("saveBtn").textContent = "Сохранить";
      $("saveBtn").disabled = false;
      saving = false;
      return;
    }
    var arr = load();
    var next = [];
    for (var i = 0; i < arr.length; i++) if (arr[i].id !== job.id) next.push(arr[i]);
    next.push(job);
    JOBS = slimJobs(next);
    persistLocal(JOBS);
    hideList = false;
    $("newBtn").classList.remove("on");
    setView("list");
    clearForm();
    render();
    try {
      await saveRemote(next);
      $("saveBtn").textContent = "Сохранено";
      setTimeout(function () { $("saveBtn").textContent = "Сохранить"; }, 1200);
    } catch (e) {
      if (e && e.message === "size") {
        alert("Карточка сохранена на этом устройстве, но слишком тяжёлая для общей базы. Уберите файлы.");
      } else {
        alert("Карточка сохранена на этом устройстве, но не попала в общую базу. Залейте архив VisualX_Baza_cloud.zip на Netlify целиком (с папкой netlify/functions).");
      }
      $("saveBtn").textContent = "Сохранить";
    }
    $("saveBtn").disabled = false;
    saving = false;
  };

  function setView(v) {
    document.body.classList.remove("view-form", "view-list", "view-rev", "form-mode");
    document.body.classList.add("view-" + v);
    if (v === "form") document.body.classList.add("form-mode");
    if ($("toolbar")) $("toolbar").classList.remove("open");
  }

  function resetHeader() {
    showAll = false;
    editId = null;
    $("allBtn").textContent = "Полный список клиентов";
    $("allBtn").classList.remove("on");
    $("revBtn").classList.remove("on");
    $("revBox").style.display = "none";
    $("newBtn").classList.remove("on");
  }

  $("newBtn").onclick = function () {
    resetHeader();
    hideList = true;
    $("newBtn").classList.add("on");
    setView("form");
    clearForm();
    render();
    if ($("name")) $("name").focus();
  };
  if ($("menuBtn")) {
    $("menuBtn").onclick = function () {
      $("toolbar").classList.toggle("open");
    };
  }
  $("allBtn").onclick = function () {
    hideList = false;
    $("newBtn").classList.remove("on");
    $("revBtn").classList.remove("on");
    $("revBox").style.display = "none";
    if (showAll) {
      showAll = false;
      $("allBtn").textContent = "Полный список клиентов";
      $("allBtn").classList.remove("on");
    } else {
      showAll = true;
      $("allBtn").textContent = "К выбранному месяцу";
      $("allBtn").classList.add("on");
    }
    setView("list");
    render();
  };

  $("revBtn").onclick = function () {
    hideList = false;
    $("newBtn").classList.remove("on");
    $("allBtn").classList.remove("on");
    $("revBox").style.display = "block";
    $("revBtn").classList.add("on");
    setView("rev");
    render();
  };
  $("revReset").onclick = function () {
    $("revFrom").value = "";
    $("revTo").value = "";
    $("revSum").textContent = "0 ₽";
    $("revList").innerHTML = "";
  };
  $("revGo").onclick = function () {
    var from = $("revFrom").value;
    var to = $("revTo").value;
    if (!from || !to) { alert("Укажите обе даты"); return; }
    var jobs = load();
    var list = [];
    var sum = 0;
    for (var i = 0; i < jobs.length; i++) {
      var d = jobs[i].date || "";
      if (d >= from && d <= to) {
        list.push(jobs[i]);
        sum += Number(jobs[i].price) || 0;
      }
    }
    list.sort(function (a, b) { return (b.date || "").localeCompare(a.date || ""); });
    $("revSum").textContent = money(sum) + " · " + list.length + " клиентов";
    var html = "";
    for (var k = 0; k < list.length; k++) html += card(list[k]);
    $("revList").innerHTML = html || "<p class=\"meta\">За этот период клиентов нет.</p>";
  };

  $("list").onclick = async function (e) {
    var btn = e.target.closest("[data-edit], [data-del], [data-save], [data-rmfile]");
    if (btn) { e.preventDefault(); e.stopPropagation(); }
    var edit = e.target.closest("[data-edit]");
    if (edit) {
      editId = edit.getAttribute("data-edit");
      render();
      return;
    }
    var saveB = e.target.closest("[data-save]");
    if (saveB) {
      var sid = saveB.getAttribute("data-save");
      var box = e.target.closest(".item");
      if (!box) return;
      var jobsS = load();
      var jobS = null;
      for (var s = 0; s < jobsS.length; s++) if (jobsS[s].id === sid) jobS = jobsS[s];
      if (!jobS) return;
      var fields = box.querySelectorAll("[data-f]");
      for (var fi = 0; fi < fields.length; fi++) {
        var key = fields[fi].getAttribute("data-f");
        jobS[key] = fields[fi].value;
      }
      jobS.price = Number(jobS.price || 0);
      if (!jobS.name) { alert("Укажите заказчика"); return; }
      var nextS = [];
      for (var ns = 0; ns < jobsS.length; ns++) nextS.push(jobsS[ns].id === sid ? jobS : jobsS[ns]);
      try { await saveAll(nextS); }
      catch (err) { alert("Не удалось сохранить в общую базу. Уберите тяжёлые файлы."); return; }
      editId = null;
      render();
      return;
    }
    var rm = e.target.closest("[data-rmfile]");
    if (rm) {
      var rid = rm.getAttribute("data-rmfile");
      var ridx = Number(rm.getAttribute("data-idx"));
      var jobsR = load();
      for (var r = 0; r < jobsR.length; r++) {
        if (jobsR[r].id === rid) {
          jobsR[r].files = (jobsR[r].files || []).filter(function (_, i) { return i !== ridx; });
        }
      }
      try { await saveAll(jobsR); } catch (e2) { alert("Не удалось сохранить."); return; }
      render();
      return;
    }
    var del = e.target.closest("[data-del]");
    if (del) {
      var id = del.getAttribute("data-del");
      if (!confirm("Удалить карточку?")) return;
      var arr = load();
      var next = [];
      for (var i = 0; i < arr.length; i++) if (arr[i].id !== id) next.push(arr[i]);
      try { await saveAll(next); } catch (e3) { alert("Не удалось сохранить."); return; }
      if ($("id").value === id) clearForm();
      render();
      return;
    }
    var fileEl = e.target.closest("[data-file]");
    if (fileEl) {
      var jobsF = load();
      var jobF = null;
      for (var jf = 0; jf < jobsF.length; jf++) if (jobsF[jf].id === fileEl.getAttribute("data-file")) jobF = jobsF[jf];
      if (!jobF || !jobF.files) return;
      var ff = jobF.files[Number(fileEl.getAttribute("data-idx"))];
      if (!ff) return;
      $("modalName").textContent = ff.name || "Файл";
      var src = fileSrc(ff);
      $("modalDl").href = src;
      $("modalDl").setAttribute("download", ff.name || "file");
      if ((ff.type || "").indexOf("image/") === 0) {
        $("modalBody").innerHTML = "<img src=\"" + src + "\" alt=\"\" />";
      } else if ((ff.type || "") === "application/pdf") {
        $("modalBody").innerHTML = "<iframe src=\"" + src + "\" style=\"height:70vh;border:0;width:100%\"></iframe>";
      } else {
        $("modalBody").innerHTML = "<p class=\"meta\">Этот файл можно скачать кнопкой ниже.</p>";
      }
      $("modal").classList.add("on");
      return;
    }
    var open = e.target.closest("[data-open]");
    if (!open) return;
    var item = open.closest(".item");
    if (!item) return;
    item.classList.toggle("opened");
  };
  $("revList").onclick = $("list").onclick;
  async function onAddFile(e) {
    var inp = e.target.closest("[data-addfile]");
    if (!inp || !inp.files || !inp.files.length) return;
    var aid = inp.getAttribute("data-addfile");
    var jobsA = load();
    var jobA = null;
    for (var a = 0; a < jobsA.length; a++) if (jobsA[a].id === aid) jobA = jobsA[a];
    if (!jobA) return;
    if (!jobA.files) jobA.files = [];
    await addPickedFiles(inp.files, jobA.files);
    inp.value = "";
    try {
      await saveAll(jobsA);
      render();
    } catch (err) {
      alert("Файлы загружены, но карточку не удалось сохранить в общую базу. Залейте архив VisualX_Baza_cloud.zip на Netlify целиком (с папкой netlify/functions).");
    }
  }
  $("list").addEventListener("change", onAddFile);
  $("revList").addEventListener("change", onAddFile);
  $("modalClose").onclick = function () { $("modal").classList.remove("on"); };
  $("modal").onclick = function (e) { if (e.target.id === "modal") $("modal").classList.remove("on"); };

  $("preview").onclick = function (e) { if (e.target.src) window.open(e.target.src, "_blank"); };
  $("filelist").onclick = function (e) {
    var idx = e.target.getAttribute("data-i");
    if (idx === null) return;
    currentFiles.splice(Number(idx), 1);
    drawFiles();
  };
  $("files").onchange = async function (e) {
    var list = e.target.files;
    if (!list || !list.length) return;
    await addPickedFiles(list, currentFiles);
    e.target.value = "";
    drawFiles();
  };

  $("q").oninput = function () { hideList = false; $("newBtn").classList.remove("on"); setView("list"); render(); };
  $("year").onchange = function () { hideList = false; $("newBtn").classList.remove("on"); setView("list"); render(); };
  $("month").onchange = function () { hideList = false; $("newBtn").classList.remove("on"); setView("list"); render(); };

  $("expBtn").onclick = function () {
    var payload = JSON.stringify({ jobs: load() });
    var src = document.documentElement.outerHTML;
    var html = src.replace("</body>", "<script id=\"vxboot\">window.VX_BOOT=" + payload + ";</scr" + "ipt></body>");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    a.download = "VisualX_baza.html";
    a.click();
  };
  $("impBtn").onclick = function () { $("impFile").click(); };
  $("impFile").onchange = function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = reader.result;
      var m = text.match(/window\.VX_BOOT=(\{[\s\S]*?\});<\/scr/);
      if (!m) { alert("Это не копия базы VisualX"); return; }
      try {
        var payload = JSON.parse(m[1]);
        if (!payload.jobs) throw new Error("no jobs");
        if (!confirm("Заменить текущие карточки данными из копии?")) return;
        saveAll(payload.jobs).then(render).catch(function () { alert("Не удалось сохранить копию в общую базу."); });
      } catch (err) { alert("Это не копия базы VisualX"); }
    };
    reader.readAsText(file);
  };

  function unlock() {
    $("lock").style.display = "none";
    $("app").style.display = "block";
    pull().then(function () {
      fillSelects();
      clearForm();
      setView("list");
      render();
    }).catch(function () {
      fillSelects();
      JOBS = readLocal();
      setView("list");
      render();
    });
  }
  function checkPass() {
    if ($("pass").value === "19375") {
      sessionStorage.setItem("vx-baza-ok", "1");
      unlock();
    } else {
      $("passErr").textContent = "Неверный пароль";
    }
  }
  $("passBtn").onclick = checkPass;
  $("pass").onkeydown = function (e) { if (e.key === "Enter") checkPass(); };
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refreshFromCloud();
  });
  window.addEventListener("focus", function () { refreshFromCloud(); });
  setInterval(function () {
    if (document.visibilityState === "visible") refreshFromCloud();
  }, 12000);
  fillSelects();
  if (sessionStorage.getItem("vx-baza-ok") === "1") unlock();
})();

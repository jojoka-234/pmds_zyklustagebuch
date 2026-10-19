'use strict';

/**
 * Renders a cycle as a two-page A4 landscape PDF that mirrors the layout of the
 * printed PMDS-Zyklustagebuch (pages 2 and 3 of the original form).
 */
function buildDiaryPdf(cyc, days, entries, symptoms) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const RED = [138, 21, 56];
  const GRID = [110, 110, 110];
  const BAR = [77, 72, 73];
  const SHADE = [196, 196, 196];
  const BLUE = [74, 134, 200];

  const X0 = 12, NUM_R = 18.6, DATE_X = 19, GROUP_X = 46, GW = 29.4;
  const HEAD_TOP = 15, BAR_Y = 29.5, BAR_H = 5, TOP = BAR_Y + BAR_H, BOTTOM = 196, RIGHT = GROUP_X + 8 * GW;
  const rows = Math.max(34, days.length);
  const rowH = (BOTTOM - TOP) / rows;

  const pad = (n) => String(n).padStart(2, '0');
  const parts = (s) => s.split('-').map(Number);
  const fmt = (s) => { const [y, m, d] = parts(s); return pad(d) + '.' + pad(m) + '.' + y; };
  const wd = (s) => { const [y, m, d] = parts(s); return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
  const dateCell = (s) => { const [, m, d] = parts(s); return wd(s) + '  ' + pad(d) + '.' + pad(m) + '.' + String(parts(s)[0]).slice(2); };

  const lastDay = days[days.length - 1];
  const period = cyc.end
    ? 'Zyklus: ' + fmt(cyc.start) + ' – ' + fmt(cyc.end) + ' (' + days.length + ' Tage)'
    : 'Zyklus ab ' + fmt(cyc.start) + ' (laufend, Stand ' + fmt(lastDay) + ')';

  // Header labels exactly like the paper form (line breaks included).
  const LABELS = [
    ['Stimmungs-', 'schwankungen'], ['Reizbarkeit,', 'Wut'], ['Depressive', 'Verstimmung'], ['Angst,', 'Anspannung'],
    ['Konzentrations-', 'schwierigkeiten,', 'Vergesslichkeit'], ['Lethargie,', 'Ermüdbarkeit,', 'Energieverlust'],
    ['Appetit-', 'veränderungen,', 'Heißhunger'], ['Schlafstörungen'], ['Körperliche', 'Symptome'], ['Andere', 'Symptome'],
  ];

  function pageFrame(pageNo, totalPages) {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PMDS-Zyklustagebuch', X0, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(period, RIGHT, 10, { align: 'right' });

    doc.setTextColor(...BLUE);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('SEITE ' + pageNo + ' / ' + totalPages, X0, 203);
    doc.setFont('helvetica', 'normal');
    doc.text('Vorlage: PMDS-Zyklustagebuch nach ICD-11  © Dorn, Schwenkhagen, Rohde 2026  ·  pmds.team', RIGHT, 203, { align: 'right' });

    doc.setFillColor(...BAR);
    doc.rect(X0, BAR_Y, RIGHT - X0, BAR_H, 'F');
  }

  /** Day numbers, date column and the dark scale bar on the left. */
  function leftColumns() {
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Datum', DATE_X + 1, BAR_Y - 2);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.text('Skala: 0 = gar nicht bis 4 =', GROUP_X - 1, BAR_Y + 2.1, { align: 'right' });
    doc.text('extrem vorhanden', GROUP_X - 1, BAR_Y + 4.1, { align: 'right' });

    doc.setTextColor(0, 0, 0);
    for (let i = 0; i < rows; i++) {
      const y = TOP + i * rowH + rowH / 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(String(i + 1), NUM_R, y, { align: 'right', baseline: 'middle' });
      if (days[i]) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(dateCell(days[i]), DATE_X + 1.2, y, { baseline: 'middle' });
      }
    }
  }

  /** A 0–4 rating block for one symptom, starting at x. */
  function ratingGroup(x, sIdx, shaded) {
    const cw = GW / 5;
    if (shaded) {
      doc.setFillColor(...SHADE);
      doc.rect(x, TOP, GW, BOTTOM - TOP, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    LABELS[sIdx].forEach((l, k) => doc.text(l, x + 1.8, HEAD_TOP + 3 + k * 3.3));

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    for (let v = 0; v < 5; v++) doc.text(String(v), x + cw * v + cw / 2, BAR_Y + BAR_H / 2, { align: 'center', baseline: 'middle' });

    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.12);
    for (let v = 1; v < 5; v++) doc.line(x + cw * v, TOP, x + cw * v, BOTTOM);

    // Crosses for the recorded values.
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    const sz = Math.min(cw, rowH) * 0.32;
    days.forEach((d, i) => {
      const e = entries[d];
      const val = e && e.r ? e.r[sIdx] : null;
      if (val === null || val === undefined) return;
      const cx = x + cw * val + cw / 2, cy = TOP + i * rowH + rowH / 2;
      doc.line(cx - sz, cy - sz, cx + sz, cy + sz);
      doc.line(cx - sz, cy + sz, cx + sz, cy - sz);
    });
  }

  function textGroup(x, w, label, field, overflow) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    label.forEach((l, k) => doc.text(l, x + 1.8, HEAD_TOP + 3 + k * 3.3));

    const fs = 6.2, lineH = fs * 0.3528 * 1.18;
    const maxLines = Math.max(1, Math.floor((rowH - 0.5) / lineH));
    doc.setFontSize(fs);
    doc.setTextColor(0, 0, 0);
    days.forEach((d, i) => {
      const e = entries[d];
      const raw = e && e[field] ? String(e[field]).replace(/\s*\n\s*/g, ' / ').trim() : '';
      if (!raw) return;
      let lines = doc.splitTextToSize(raw, w - 2.4);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        let last = lines[maxLines - 1];
        while (last.length && doc.getTextWidth(last + '… *') > w - 2.4) last = last.slice(0, -1);
        lines[maxLines - 1] = last.trimEnd() + '… *';
        overflow.push(d);
      }
      const top = TOP + i * rowH + (rowH - lines.length * lineH) / 2 + lineH * 0.78;
      lines.forEach((l, k) => doc.text(l, x + 1.2, top + k * lineH));
    });
  }

  function rowLines() {
    for (let i = 0; i <= rows; i++) {
      const y = TOP + i * rowH;
      const major = i > 0 && i < rows && i % 5 === 0;
      if (major) { doc.setDrawColor(...RED); doc.setLineWidth(i === 25 || i === 30 ? 0.45 : 0.25); }
      else { doc.setDrawColor(...GRID); doc.setLineWidth(0.12); }
      doc.line(major ? X0 : DATE_X, y, RIGHT, y);
    }
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.12);
    doc.line(DATE_X, TOP, DATE_X, BOTTOM);
  }

  function separators(xs) {
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.3);
    xs.forEach(x => doc.line(x, HEAD_TOP, x, BOTTOM));
    doc.setDrawColor(...GRID);
    doc.setLineWidth(0.12);
    doc.line(RIGHT, BAR_Y, RIGHT, BOTTOM);
  }

  const overflow = [];

  // ---- Page 1: core symptoms 1–8 ----
  pageFrame(1, 2);
  for (let s = 0; s < 8; s++) ratingGroup(GROUP_X + s * GW, s, s % 2 === 0);
  leftColumns();
  rowLines();
  separators([...Array(8)].map((_, s) => GROUP_X + s * GW));

  // ---- Page 2: physical / other symptoms and notes ----
  doc.addPage();
  pageFrame(2, 2);
  ratingGroup(GROUP_X, 8, true);
  ratingGroup(GROUP_X + GW, 9, false);
  const T1 = GROUP_X + 2 * GW, T2 = T1 + 92;
  textGroup(T1, T2 - T1, ['Auswirkungen auf', 'Studium / Beruf / Familienleben'], 'work', overflow);
  textGroup(T2, RIGHT - T2, ['Besondere Belastungen /', 'Ereignisse'], 'events', overflow);
  leftColumns();
  rowLines();
  separators([GROUP_X, GROUP_X + GW, T1, T2]);

  // ---- Optional appendix with the full text of long notes ----
  const longDays = [...new Set(overflow)].sort();
  if (longDays.length) {
    doc.addPage();
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('PMDS-Zyklustagebuch – Notizen im vollen Wortlaut (*)', X0, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(period, 297 - X0, 12, { align: 'right' });
    let y = 22;
    const colW = (297 - 2 * X0 - 38) / 2;
    const cA = X0 + 38, cB = cA + colW;
    const head = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('Zyklustag / Datum', X0, y);
      doc.text('Auswirkungen auf Studium / Beruf / Familienleben', cA, y);
      doc.text('Besondere Belastungen / Ereignisse', cB, y);
      y += 2;
      doc.setDrawColor(...RED);
      doc.setLineWidth(0.3);
      doc.line(X0, y, 297 - X0, y);
      y += 5;
    };
    head();
    longDays.forEach((d) => {
      const e = entries[d] || {};
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const a = doc.splitTextToSize(e.work || '', colW - 4);
      const b = doc.splitTextToSize(e.events || '', colW - 4);
      const h = Math.max(1, a.length, b.length) * 3.8;
      if (y + h > 198) { doc.addPage(); y = 16; head(); }
      doc.setFont('helvetica', 'bold');
      doc.text('Tag ' + (days.indexOf(d) + 1), X0, y);
      doc.setFont('helvetica', 'normal');
      doc.text(wd(d) + ' ' + fmt(d), X0 + 12, y);
      doc.text(a, cA, y, { lineHeightFactor: 1.27 });
      doc.text(b, cB, y, { lineHeightFactor: 1.27 });
      y += h + 2;
      doc.setDrawColor(...GRID);
      doc.setLineWidth(0.1);
      doc.line(X0, y - 3.5, 297 - X0, y - 3.5);
    });
  }

  doc.setProperties({ title: 'PMDS-Zyklustagebuch ' + fmt(cyc.start), creator: 'Zyklustagebuch-App' });
  return doc;
}

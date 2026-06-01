import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Bundle, Patient } from 'fhir/r4';
import {
  groupBundleByType,
  resourceSummary,
  resourceTimestamp,
  shortDateTime,
} from './dsp-display';
import {
  GENDER_LABELS,
  ZONE_LABELS,
  RISK_GROUP_LABELS,
  patientDisplayName,
  patientMrn,
  patientZone,
  patientRiskGroup,
} from '../patients/patient-display';

/**
 * Generates and downloads a comprehensive PDF report for a patient DSP.
 * Includes identity, care plans, observations, and diagnostic reports.
 */
export function downloadDspPdf(patientId: string, bundle: Bundle | undefined) {
  if (!bundle) return;

  const doc = new jsPDF();
  const sections = groupBundleByType(bundle);
  const patient = bundle.entry?.find((e) => e.resource?.resourceType === 'Patient')
    ?.resource as Patient;

  const name = patient ? patientDisplayName(patient) : 'Inconnu';
  const mrn = patient ? patientMrn(patient) : patientId;
  const gender = patient?.gender ? GENDER_LABELS[patient.gender as 'male' | 'female'] || patient.gender : '—';
  const birthDate = patient?.birthDate || '—';
  const zone = patient ? patientZone(patient) : undefined;
  const risk = patient ? patientRiskGroup(patient) : undefined;

  // --- Header ---
  doc.setFontSize(18);
  doc.setTextColor(15, 118, 110); // clinical-700
  doc.text('Dossier de Santé Partagé (DSP)', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text('Hôpital Provincial Hassan II de Settat', 14, 26);
  doc.text(`Généré le : ${new Date().toLocaleString('fr-FR')}`, 14, 31);

  // --- Patient Info Box ---
  doc.setDrawColor(229, 231, 235); // gray-200
  doc.setFillColor(249, 250, 251); // gray-50
  doc.roundedRect(14, 40, 182, 45, 2, 2, 'FD');

  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.text(name, 20, 50);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Identifiant HPHII : ${mrn}`, 20, 58);
  doc.text(`Sexe : ${gender}`, 20, 63);
  doc.text(`Naissance : ${birthDate}`, 20, 68);

  doc.text(`Zone : ${zone ? ((ZONE_LABELS as any)[zone] || zone) : '—'}`, 100, 58);
  doc.text(`Risque : ${risk ? ((RISK_GROUP_LABELS as any)[risk] || risk) : '—'}`, 100, 63);
  doc.text(`Identifiant logique : Patient/${patientId}`, 100, 68);

  let y = 100;

  // --- Sections ---
  for (const section of sections) {
    if (section.type === 'Patient') continue; // Already in header
    if (section.resources.length === 0) continue;

    // Check for page overflow
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(15, 118, 110);
    doc.setFont('helvetica', 'bold');
    doc.text(section.label, 14, y);
    doc.setDrawColor(15, 118, 110);
    doc.line(14, y + 2, 196, y + 2);
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [['Détail', 'Date / Heure', 'ID Ressource']],
      body: section.resources.map((r) => [
        resourceSummary(r),
        shortDateTime(resourceTimestamp(r)),
        `${r.resourceType}/${r.id || '—'}`,
      ]),
      theme: 'striped',
      headStyles: { fillColor: [15, 118, 110] },
      margin: { left: 14, right: 14 },
      didDrawPage: (data) => {
        y = data.cursor?.y || y;
      },
    });

    y += 15;
  }

  // --- Footer ---
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Page ${i} sur ${pageCount} — Prototype HPHII SHR (PoC) — Document confidentiel`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' },
    );
  }

  doc.save(`DSP_${name.replace(/\s+/g, '_')}_${patientId}.pdf`);
}

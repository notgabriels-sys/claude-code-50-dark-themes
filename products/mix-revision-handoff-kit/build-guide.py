#!/usr/bin/env python3
"""Build the customer-facing workflow guide."""

from pathlib import Path
import sys

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether,
)

OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("Mix_Revision_and_Mastering_Handoff_Guide.pdf")
OUT.parent.mkdir(parents=True, exist_ok=True)

INK = colors.HexColor("#171817")
PAPER = colors.HexColor("#F2EEE5")
MUTED = colors.HexColor("#696860")
LINE = colors.HexColor("#C8C1B5")
ACCENT = colors.HexColor("#E35A2B")
WHITE = colors.HexColor("#FFFDF8")


class GuideDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, rightMargin=18*mm, leftMargin=18*mm,
                         topMargin=20*mm, bottomMargin=18*mm,
                         title="Mix Revision & Mastering Handoff Guide",
                         author="Gabriel Garcia Alonso / Hologram People")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="body")
        self.addPageTemplates(PageTemplate(id="guide", frames=frame, onPage=self.decorate))

    def decorate(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        canvas.setStrokeColor(ACCENT)
        canvas.setLineWidth(1.2)
        canvas.line(18*mm, A4[1]-12*mm, A4[0]-18*mm, A4[1]-12*mm)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(18*mm, 9*mm, "HOLOGRAM PEOPLE  /  WORKFLOW SYSTEM 01")
        canvas.drawRightString(A4[0]-18*mm, 9*mm, f"{doc.page}")
        canvas.restoreState()


base = getSampleStyleSheet()
styles = {
    "eyebrow": ParagraphStyle("eyebrow", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=8,
        leading=10, textColor=ACCENT, spaceAfter=7, tracking=1.2),
    "title": ParagraphStyle("title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=31,
        leading=31, textColor=INK, alignment=TA_LEFT, spaceAfter=10),
    "subtitle": ParagraphStyle("subtitle", parent=base["Normal"], fontName="Helvetica", fontSize=12,
        leading=17, textColor=MUTED, spaceAfter=15),
    "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=22,
        leading=25, textColor=INK, spaceAfter=10),
    "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12,
        leading=15, textColor=INK, spaceBefore=8, spaceAfter=5),
    "body": ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.3,
        leading=13.2, textColor=INK, spaceAfter=7),
    "small": ParagraphStyle("small", parent=base["BodyText"], fontName="Helvetica", fontSize=8,
        leading=11, textColor=MUTED, spaceAfter=5),
    "callout": ParagraphStyle("callout", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=10,
        leading=14, textColor=WHITE),
}


def p(text, style="body"):
    return Paragraph(text, styles[style])


def page_heading(number, title, intro):
    return [p(f"SECTION {number}", "eyebrow"), p(title, "h1"), p(intro, "subtitle")]


def bullet(text):
    return p(f"<font color='#E35A2B'>●</font>&nbsp;&nbsp;{text}")


def callout(text):
    table = Table([[p(text, "callout")]], colWidths=[174*mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), INK), ("BOX", (0,0), (-1,-1), 0.5, INK),
        ("LEFTPADDING", (0,0), (-1,-1), 8), ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    return table


def flow_table(rows):
    data = [[p(a, "eyebrow"), p(b, "body"), p(c, "small")] for a,b,c in rows]
    table = Table(data, colWidths=[19*mm, 95*mm, 60*mm], repeatRows=0)
    table.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LINEBELOW", (0,0), (-1,-2), 0.35, LINE),
        ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 7), ("BOTTOMPADDING", (0,0), (-1,-1), 7),
    ]))
    return table


story = []
story += [Spacer(1, 24*mm), p("A PRACTICAL, DAW-AGNOSTIC SYSTEM", "eyebrow"),
          p("Mix Revision &<br/>Mastering Handoff", "title"),
          p("Collect clear feedback. Control versions. Approve the exact file. Deliver with evidence.", "subtitle"),
          Spacer(1, 8*mm), callout("ELEVEN EDITABLE TEMPLATES + THIS WORKFLOW GUIDE"),
          Spacer(1, 18*mm), p("Built for independent artists, producers and engineers who need a reliable path from first mix to accepted delivery without turning the process into project-management theatre.", "body"),
          Spacer(1, 4*mm), p("Gabriel Garcia Alonso / Hologram People", "eyebrow"),
          PageBreak()]

story += page_heading("01", "The control loop", "Every stage produces one record that makes the next decision possible.")
story += [flow_table([
    ("01", "BRIEF", "Agree scope, direction, dependencies and destination."),
    ("02", "REVIEW", "Make sure everyone hears the same identified version."),
    ("03", "CONSOLIDATE", "Turn scattered comments into one complete revision request."),
    ("04", "REVISE", "Record requested changes, completed changes and open deviations."),
    ("05", "APPROVE", "Identify the exact file and preserve sign-off evidence."),
    ("06", "HAND OFF", "Send creative intent plus confirmed technical requirements."),
    ("07", "VERIFY", "Inspect files, reopen the archive and record delivery."),
]), Spacer(1, 7*mm), callout("Rule: a message saying “sounds good” is not enough unless it identifies the exact version being approved."),
Spacer(1, 8*mm), p("Use the smallest useful system", "h2"),
bullet("One folder per track or project. Duplicate the full kit before starting."),
bullet("One stable version ID per render. Do not overwrite a version that has already been sent."),
bullet("One consolidated feedback document per round, owned by one decision-maker."),
bullet("One approval record for the exact file entering mastering or final delivery."), PageBreak()]

story += page_heading("02", "Brief, references and review", "Useful references explain a decision. They do not ask one track to become another.")
story += [p("01 — Project brief", "h2"), p("Complete identity, scope and creative direction before technical work. Treat missing assets, plugin dependencies and destination requirements as visible blockers. If the release destination has not supplied a specification, write UNVERIFIED instead of inventing one."),
p("02 — Reference track log", "h2"), p("For each reference, state the exact purpose and section: low-end movement in the first drop, vocal depth in the chorus, transient density in the final minute. Level-match before making tonal or loudness comparisons, and record the decision the reference actually supports."),
p("A disciplined review pass", "h2"),
bullet("Confirm the exact filename or version ID before playback."),
bullet("Listen once for direction before collecting isolated fixes."),
bullet("Use timestamps and name the element, observation and desired outcome."),
bullet("Separate mix corrections from new production, arrangement or editing requests."),
bullet("Check that comments from different decision-makers do not conflict."),
Spacer(1, 6*mm), callout("Weak: “Make it hit harder.”  Stronger: “02:14–02:30, kick loses impact when the synth opens; restore physical weight without increasing the synth’s brightness.”"), PageBreak()]

story += page_heading("03", "Revisions and version identity", "A clean revision history protects creative memory and prevents people reviewing the wrong render.")
story += [p("03 — Mix revision log", "h2"), p("Create one row when a version is sent. Link it to the source session and feedback round. Record what was requested, what was completed, and any deliberate deviation or question. Status describes the review state; it does not replace approval evidence."),
p("04 — Consolidated feedback", "h2"), p("One person combines all comments into a single document. The document should preserve what already works, identify the highest-priority problem, and state whether the mix still matches the brief. Conflicts return to the decision-makers before revision work begins."),
p("Filename structure", "h2"), p("A useful filename carries identity, role, version and date. Add format information when multiple deliverables could otherwise collide. Example: <b>ARTIST_TITLE_MAIN_v03_20260820_48k24b.wav</b>. Never use FINAL, FINAL2 or LATEST as the only version control."),
p("Version-state vocabulary", "h2"),
flow_table([
    ("DRAFT", "Internal work", "Not sent for approval."),
    ("REVIEW", "Sent for feedback", "Awaiting one consolidated response."),
    ("REVISE", "Changes requested", "Not approved."),
    ("APPROVED", "Exact version signed off", "Ready for the named next destination."),
    ("SUPERSEDED", "Replaced by a later version", "Keep for history; do not deliver."),
]), PageBreak()]

story += page_heading("04", "Approval and mastering handoff", "Approval closes a defined decision. The mastering brief carries intent without prescribing the engineer’s entire method.")
story += [p("05 — Approval record", "h2"), p("Record the exact filename, version ID, size and optional checksum. Preserve who approved it, when, in which timezone and where the evidence lives. State whether the file is approved for mastering, approved as the final master, or accepted with documented deviations."),
p("06 — Mastering brief", "h2"), p("Lead with listening context, desired emotional or physical qualities, and what must not change. Then describe intentional mix-bus processing, limiting or clipping, supplied alternates and known concerns. Technical targets belong only in the destination section and must name their authoritative source."),
p("What not to assume", "h2"),
bullet("There is no universal loudness or true-peak target for every release."),
bullet("There is no universal amount of required mix headroom."),
bullet("There is no universal revision count or turnaround commitment."),
bullet("An unprocessed mix is not automatically preferable; document creative processing."),
bullet("A mastering handoff does not reopen an already approved mix unless a problem is found."),
Spacer(1, 7*mm), callout("If a requirement is absent, mark it UNVERIFIED and identify who can confirm it. Unknown is a valid state; a guessed specification is not."), PageBreak()]

story += page_heading("05", "Export, QC and delivery", "Delivery is complete only when the package matches the confirmed brief and can be reopened independently.")
story += [p("07–09 — Requirements, matrix and filenames", "h2"), p("First convert the recipient’s request into explicit states: CONFIRMED, UNVERIFIED, BLOCKED or NOT APPLICABLE. Then create one export-matrix row per main mix, alternate, instrumental, edit or stem. Generate filenames before export and collision-check them as a set."),
p("10 — Final QC", "h2"), p("Inspect identity and file headers, then audition the beginning, loudest passage, a transition, a representative quiet passage, and the complete ending. Check technical values only against the confirmed destination brief. For stems, reconstruct the mix where required."),
p("11 — Delivery manifest", "h2"), p("Inventory exactly what was delivered. File size and SHA-256 checksum can prove that a recipient received the same bytes you verified. Record transfer completion and recipient acceptance separately: upload success alone is not acceptance."),
p("Final gate", "h2"),
flow_table([
    ("READY", "Technical QC passed", "All required checks completed."),
    ("DEVIATION", "Ready with documented exception", "Recipient understands the exception."),
    ("INCOMPLETE", "Rendered, QC unfinished", "Do not represent as final delivery."),
    ("BLOCKED", "Requirement or media missing", "Resolve before delivery."),
]), Spacer(1, 6*mm), callout("Archive test: create the delivery archive, reopen it into a clean temporary folder, and verify the extracted contents against the manifest."), PageBreak()]

story += page_heading("06", "Fast operating procedure", "The full system remains useful even when the project is small.")
story += [flow_table([
    ("START", "Duplicate the kit", "Rename the folder with artist and track."),
    ("DEFINE", "Complete 01 and 02", "Resolve scope, references and blockers."),
    ("REVIEW", "Log each sent mix in 03", "Use one stable ID per render."),
    ("COLLECT", "Consolidate notes in 04", "One complete request per round."),
    ("LOCK", "Record approval in 05", "Identify the exact approved bytes."),
    ("HANDOFF", "Complete 06 and 07", "Creative intent plus confirmed destination."),
    ("EXPORT", "Build 08 and 09", "One required asset per row."),
    ("VERIFY", "Run 10 and complete 11", "Reopen, inspect, transfer, accept."),
]), Spacer(1, 8*mm), p("Field states", "h2"),
bullet("CONFIRMED — read from the governing source or explicitly agreed."),
bullet("UNVERIFIED — expected but not yet checked against an authority."),
bullet("BLOCKED — cannot proceed safely without missing information or media."),
bullet("NOT APPLICABLE — deliberately excluded for this destination."),
Spacer(1, 7*mm), p("Scope note", "h2"), p("This kit is a workflow resource. It is not a legal contract, does not define commercial terms, and does not replace specifications supplied by a label, distributor, manufacturer, broadcaster, platform or mastering engineer."),
Spacer(1, 8*mm), callout("The goal is simple: every important decision should point to an exact version, an accountable person and a verifiable next state."),
Spacer(1, 11*mm), p("MIX REVISION & MASTERING HANDOFF KIT  /  v1.0", "eyebrow")]

GuideDoc(str(OUT)).build(story)
print(OUT)

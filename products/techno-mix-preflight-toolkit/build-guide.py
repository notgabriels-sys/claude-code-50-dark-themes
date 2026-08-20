from pathlib import Path
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, PageBreak, KeepTogether, Table, TableStyle

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "pack" / "Techno_Mix_Preflight_Toolkit_by_Hologram_People" / "Techno_Mix_Preflight_Guide.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)

BLACK = HexColor("#0a0a0a")
IVORY = HexColor("#eee8dc")
MUTED = HexColor("#8f8a82")
GRID = HexColor("#35322e")
ORANGE = HexColor("#db5a2a")
PAPER = HexColor("#f7f4ed")

class GuideDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, leftMargin=22*mm, rightMargin=22*mm,
                         topMargin=21*mm, bottomMargin=18*mm, title="Techno Mix Preflight Toolkit")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="body")
        self.addPageTemplates(PageTemplate(id="pages", frames=[frame], onPage=self.page_frame))

    def page_frame(self, canvas, doc):
        canvas.saveState()
        canvas.setAuthor("Gabriel Garcia Alonso / Hologram People")
        canvas.setSubject("DAW-agnostic techno mix translation and export-readiness guide")
        canvas.setKeywords("techno, mixing, mono, polarity, low end, preflight, audio")
        canvas.setFillColor(BLACK)
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        canvas.setStrokeColor(GRID)
        canvas.setLineWidth(0.5)
        canvas.line(22*mm, 14*mm, A4[0]-22*mm, 14*mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(22*mm, 9*mm, "HOLOGRAM PEOPLE / TECHNO MIX PREFLIGHT")
        canvas.drawRightString(A4[0]-22*mm, 9*mm, f"{doc.page}")
        canvas.restoreState()

styles = getSampleStyleSheet()
title = ParagraphStyle("Title", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=31,
                       leading=31, textColor=IVORY, alignment=TA_LEFT, spaceAfter=9*mm)
eyebrow = ParagraphStyle("Eyebrow", parent=styles["Normal"], fontName="Helvetica", fontSize=8,
                         leading=10, textColor=ORANGE, tracking=2.2, spaceAfter=4*mm)
h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=19,
                    leading=22, textColor=IVORY, spaceBefore=2*mm, spaceAfter=5*mm)
h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=11,
                    leading=14, textColor=ORANGE, spaceBefore=4*mm, spaceAfter=2*mm)
body = ParagraphStyle("Body", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2,
                      leading=13.2, textColor=IVORY, spaceAfter=3.2*mm)
small = ParagraphStyle("Small", parent=body, fontSize=7.8, leading=10.5, textColor=MUTED)
bullet = ParagraphStyle("Bullet", parent=body, leftIndent=5*mm, firstLineIndent=-3.5*mm,
                        bulletIndent=0, spaceAfter=2.2*mm)
callout = ParagraphStyle("Callout", parent=body, fontName="Helvetica-Bold", fontSize=10.5,
                         leading=15, borderColor=ORANGE, borderWidth=1, borderPadding=7,
                         backColor=HexColor("#171310"), spaceBefore=2*mm, spaceAfter=5*mm)

def P(text, style=body): return Paragraph(text, style)
def B(text): return Paragraph(text, bullet, bulletText="-")
def section(label, heading): return [P(label.upper(), eyebrow), P(heading, h1)]

story = []
story += [Spacer(1, 18*mm), P("HOLOGRAM PEOPLE / PRODUCTION UTILITY 01", eyebrow),
          P("TECHNO MIX<br/>PREFLIGHT TOOLKIT", title),
          P("A repeatable ten-minute check for routing, mono compatibility, low-end audibility, frequency balance and export readiness.", callout),
          Spacer(1, 7*mm)]

summary_data = [
    [P("24", ParagraphStyle("n", parent=title, fontSize=24, leading=25, textColor=ORANGE)), P("calibrated stereo WAV files", small)],
    [P("48 kHz", ParagraphStyle("n2", parent=title, fontSize=20, leading=22, textColor=IVORY)), P("24-bit PCM / no plugins", small)],
    [P("10 min", ParagraphStyle("n3", parent=title, fontSize=20, leading=22, textColor=IVORY)), P("repeatable pre-master workflow", small)],
]
table = Table(summary_data, colWidths=[39*mm, 102*mm], rowHeights=[18*mm]*3)
table.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LINEBELOW",(0,0),(-1,-2),0.5,GRID),
                           ("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),3*mm)]))
story += [table, Spacer(1, 10*mm), P("START QUIET", eyebrow),
          P("Turn the monitoring level down before any test tone. These files are decision references, not a certified room-calibration or hearing-test system.", small), PageBreak()]

story += section("01 / operating method", "Use evidence, not automatic correction")
story += [P("The toolkit separates five questions that are often confused at the end of a mix: is the routing correct, does the stereo information survive mono, can the room reproduce the relevant low end, is one frequency region dominating the decision, and is the exported file actually the approved mix?"),
          P("Import the WAVs onto clean audio tracks. Disable warping, normalisation, fades, effects and automatic gain changes. Route them through the same monitor path used for the mix, but not through creative mix-bus processing."),
          P("A failed observation does not tell you what to change. It tells you where to investigate. For example, a quiet 35 Hz tone can indicate a playback limitation, a listening-position null or both. Boosting the mix at 35 Hz without further evidence may make translation worse.", callout),
          P("The ten-minute order", h2),
          B("Verify left, right and centre routing before judging the mix."),
          B("Check the intentional opposite-polarity file in stereo, then through a mono sum."),
          B("Map low-end audibility quietly from 100 Hz downward; note sharp changes."),
          B("Compare the four frequency-focus references at one fixed monitor level."),
          B("Check the mix quietly, in mono and on one constrained playback system."),
          B("Export, reopen and spot-check the rendered file itself."),
          P("Do not chase identical perceived loudness between sine frequencies. Human hearing, room response and transducers are frequency-dependent. The purpose is to expose changes, not to create a flat subjective curve by ear.", small), PageBreak()]

story += section("02 / file map", "Level and low-end references")
story += [P("Level files", h2),
          P("The 1 kHz and pink-noise references provide stable, conservative signals for checking meter behavior and keeping repeated comparisons at a fixed playback position. The -30 dBFS sine is useful when checking whether a quiet signal remains clean and centered."),
          P("The stated values are digital RMS levels per active channel. They are not an instruction to set a particular acoustic SPL without a calibrated sound-level meter and an appropriate standard."),
          P("Low-end audibility", h2),
          P("Ten sine files cover 30, 35, 40, 45, 50, 55, 60, 70, 80 and 100 Hz at -20 dBFS RMS. Start at 100 Hz and move downward at low volume. Note frequencies that change sharply, pull to one side, rattle the room or disappear at the listening position."),
          P("Useful observations", h2),
          B("A broad, gradual reduction may reflect the playback system's extension."),
          B("A narrow disappearance or sudden increase is more consistent with a room-position interaction."),
          B("A physical rattle identifies an object or structure to inspect, not a mix frequency to remove automatically."),
          B("Large left/right differences can indicate asymmetric placement, routing or room response."),
          P("Never raise a low-frequency test tone aggressively to force audibility. Stop if the monitor, subwoofer, room or your hearing shows distress.", callout), PageBreak()]

story += section("03 / translation", "Stereo, mono, polarity and frequency focus")
story += [P("Routing and centre", h2),
          P("Left-only and right-only pink-noise files reveal swapped or unintended routing. The mono-centre file should form a stable phantom centre when both speakers and the listening position are reasonably symmetrical."),
          P("Polarity demonstration", h2),
          P("The in-phase 100 Hz file is identical in both channels. The intentionally opposite-polarity version has one channel inverted and should cancel strongly when summed to mono. It is diagnostic by design and must not be mistaken for damaged audio."),
          P("If the opposite-polarity file does not cancel through a true mono sum, inspect the routing, processing and timing of the two channels. Do not use speaker polarity changes as a casual mix correction.", callout),
          P("Stereo-width reference", h2),
          P("The width-noise file contains both common and opposing channel information. Use it to hear the difference between stereo playback and mono summing. It is not a target for how wide a mix should be."),
          P("Frequency-focus references", h2),
          P("Four broad noise regions isolate sub, low-mid, mid and high emphasis. Compare them at one monitor position to reacquaint your ear with the system before returning to the mix. Their filters are approximate production references, not laboratory-grade crossover bands."),
          P("When summing the actual mix to mono, note disappearing percussion, unstable ambience, hollow low end and major changes in lead level. Decide whether each change is artistically acceptable rather than forcing every element to become mono.", small), PageBreak()]

story += section("04 / delivery", "The export is the product")
story += [P("A finished session is not a finished delivery. The file leaving the DAW must be checked independently."),
          P("Before export", h2),
          B("Save a clearly named revision and confirm the approved arrangement."),
          B("Check missing media, offline devices, unintended mutes, solo states and automation."),
          B("Confirm the required sample rate, bit depth, channel layout and processing state."),
          B("Leave complete effect tails and use the intended start and end boundaries."),
          P("After export", h2),
          B("Reopen the exported file, not the live session."),
          B("Audition the beginning, loudest section, one transition, a quiet section and the ending."),
          B("Confirm filename, duration, channels, sample rate, bit depth and nonzero file size."),
          B("Record any mastering notes separately from the approved mix file."),
          P("Mastering handoff", h2),
          P("Do not apply a universal loudness or true-peak target unless the destination or mastering brief requires it. Preserve the mix version that was approved, state whether mix-bus limiting is intentional, and disclose any alternate versions clearly."),
          P("The included plain-text checklist mirrors this workflow and can be copied into project notes. The audio files and checklist are reusable across DAWs; no plugin, account or internet connection is required.", callout),
          Spacer(1, 5*mm), P("Hologram People / Gabriel Garcia Alonso / Berlin / 2026", small)]

GuideDoc(str(OUT)).build(story)
print(OUT)

"""Prova completa dell'app nel browser (Chrome), come farebbe una persona.

Uso (dopo `npm run build`):  python3 tests/smoke.py
Serve Python con Playwright e Google Chrome installati. Non gira su GitHub Actions.
"""
import http.server
import json
import pathlib
import socketserver
import sys
import threading

from playwright.sync_api import sync_playwright

DIST = pathlib.Path(__file__).resolve().parent.parent / "dist"
errors = []


def serve():
    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(*a, directory=str(DIST), **k)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("  ok -", msg)


def hold(page, selector, overlay, during=None):
    """Tiene premuto il dito su un pulsante: restituisce (visibile mentre premuto, nascosto dopo)."""
    box = page.locator(selector).bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.mouse.down()
    shown = page.locator(overlay).is_visible()
    if during:
        during()
    page.mouse.up()
    return shown, page.locator(overlay).is_hidden()


def main():
    httpd = serve()
    url = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        context.grant_permissions(["clipboard-read", "clipboard-write"])
        page = context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.goto(url)
        page.wait_for_load_state("networkidle")

        print("Setup")
        check(page.locator("#headerTitle").inner_text() == "Lupus", "titolo Lupus")
        check(page.locator("#btnStartDistribution").is_disabled(), "distribuisci disattivato senza giocatori")
        page.fill("#playerNameInput", "Anna, Bruno, Carla, Dario, Elena, Fabio")
        page.click("text=+ Aggiungi")
        check(page.locator(".player-chip").count() == 6, "6 giocatori aggiunti")
        check(page.locator("#btnFullscreen").count() == 0, "niente pulsante schermo intero")
        check(not page.locator("#btnStartDistribution").is_disabled(), "preset scelto in automatico: si può distribuire")

        # Mazzo personalizzato senza lupi: deve spiegare il problema
        page.click("#tabBtnCustom")
        page.click("text=Azzera mazzo")
        check("Mancano 6 ruoli" in page.locator("#stickyDeckProblem").inner_text(), "spiega che mancano ruoli")
        page.evaluate("for (let i = 0; i < 6; i++) changeCustomRoleQty('contadino', 1)")
        check("almeno un Lupo" in page.locator("#stickyDeckProblem").inner_text(), "spiega che serve un lupo")
        page.click("#tabBtnPresets")
        page.locator(".preset-item").first.click()
        check(page.locator("#stickyDeckProblem").is_hidden(), "preset valido: nessun problema")

        # Tutti i preset da 5 a 15 devono essere distribuibili
        for n in range(5, 16):
            ok = page.evaluate(
                """n => (PRESETS_BY_COUNT[n] || []).every(p => getDeckProblems(p.roles, n, findRoleOrNull).length === 0)""",
                n,
            )
            check(ok, f"preset da {n} giocatori validi")

        print("Distribuzione")
        page.click("#btnStartDistribution")
        for i in range(6):
            check(page.locator("#btnDistNext").is_disabled(), f"giocatore {i + 1}: 'Ho visto' spento prima di guardare")
            if i == 0:
                # Tasto Indietro mentre il ruolo è visibile: lo copre
                shown, hidden = hold(page, "#btnRevealRole", "#distStepReveal",
                                     lambda: check(page.evaluate("handleAndroidBack()") is True, "indietro gestito"))
            else:
                shown, hidden = hold(page, "#btnRevealRole", "#distStepReveal")
            check(shown and hidden, f"ruolo {i + 1} visibile solo col dito premuto")
            check(page.locator("#btnDistNext").is_enabled(), f"giocatore {i + 1}: 'Ho visto' acceso")
            page.click("#btnDistNext")
        page.click("text=Inizia la Partita")
        check(page.locator("#screenNarrator").is_visible(), "cruscotto del narratore")

        # Prepara una situazione nota: ruoli fissi
        page.evaluate(
            """() => {
              const roles = ['lupo', 'veggente', 'guardia', 'contadino', 'giullare', 'medium'];
              activeMatch.players.forEach((p, i) => { p.roleId = roles[i]; p.originalRoleId = roles[i]; });
              activeMatch.initialDeckMap = { lupo: 1, veggente: 1, guardia: 1, contadino: 1, giullare: 1, medium: 1 };
              saveMatchToStorage(); renderNarratorDashboard();
            }"""
        )
        guide = lambda: page.locator("#guideStep").inner_text()
        target = lambda name: page.locator(f"#guideStep .target-btn:has-text('{name}')")
        nxt = lambda: page.click("#guideStep .guide-nav .btn-primary")

        print("Notte 1 guidata")
        check("Cala la notte" in guide() and "Veggente" in guide(), "inizio della notte con i ruoli da chiamare")
        check(page.locator(".guide-chip").count() == 5, "passi: notte, veggente, guardia, lupi, alba")
        nxt()
        check("È: Bruno" in guide() and "Si sveglia il Veggente" in guide(), "passo del Veggente con la sua frase")
        check(target("Bruno").is_disabled(), "il Veggente non può sondare sé stesso")
        target("Anna").click()
        check("Fai SÌ" in guide(), "Veggente: Anna è un lupo -> SÌ")
        nxt()
        check(target("Carla").is_disabled(), "la Guardia non protegge sé stessa")
        target("Bruno").click()
        nxt()
        check(target("Anna").is_disabled() and "è un lupo" in target("Anna").inner_text(), "i lupi non scelgono un lupo")
        target("Dario").click()
        check("Vittima dei lupi: Dario" in guide(), "vittima scelta")
        nxt()
        check("Dario muore" in guide() and "sbranato" in guide(), "alba: Dario morirà")
        page.click("#guideStep button:has-text('Fai sorgere il Giorno 1')")

        print("Giorno 1 guidato")
        check("Giorno 1" in page.locator("#narratorPhaseBadge").inner_text(), "è giorno")
        check("è morto Dario" in guide(), "annuncio del mattino automatico")
        check(page.evaluate("activeMatch.players[3].isDead && activeMatch.players[3].deathCause === 'notte'"), "Dario segnato morto da solo")
        check("Fantasma" in guide(), "Dario diventa il Fantasma")

        # Scheda Giocatori: correzioni (Giullare al rogo -> vince lui)
        page.click("#tabBtnPlayers")
        cards = page.locator(".narrator-player-card")
        check("Fantasma" in cards.nth(3).inner_text(), "nella scheda Giocatori Dario è il Fantasma")
        cards.nth(4).locator("button[title='Elimina / Uccidi giocatore']").click()
        check(page.locator("#modalDeathCause").is_visible(), "di giorno chiede come è morto")
        page.click("#modalDeathCause button:has-text('Bruciato al rogo')")
        check("GIULLARE" in page.locator("#victoryBannerText").inner_text(), "vittoria del Giullare al rogo")
        page.click("text=✖ Continua")
        cards.nth(4).locator("button[title='Elimina / Uccidi giocatore']").click()
        check("Vivo" in cards.nth(4).inner_text(), "Elena di nuovo viva")
        page.click("#tabBtnGuide")

        nxt()
        check(page.locator("#dayTimerDisplay").is_visible(), "dibattito con il timer")
        page.click("text=+30s")
        check(page.locator("#dayTimerDisplay").inner_text() == "03:30", "timer +30s")
        page.click("text=−30s")
        nxt()

        print("Votazione")
        page.click("#guideStep button:has-text('Apri la votazione')")
        check(page.locator("#modalVote").is_visible(), "finestra votazione")
        selects = page.locator("#voteVotersList select")
        check(selects.count() == 6, "votano 5 vivi + il Fantasma")
        # Pareggio: Anna 2 (Bruno, Carla) - Fabio 2 (Anna, Dario fantasma)
        selects.nth(0).select_option("p_5")
        selects.nth(1).select_option("p_0")
        selects.nth(2).select_option("p_0")
        selects.nth(3).select_option("p_5")
        check("Pareggio" in page.locator("#voteActions").inner_text(), "pareggio riconosciuto")
        page.click("#voteActions button:has-text('Ballottaggio')")
        selects = page.locator("#voteVotersList select")
        check(selects.nth(0).locator("option").count() == 3, "al ballottaggio si vota solo tra i due")
        for i in (1, 2, 3):
            selects.nth(i).select_option("p_5")
        check("Brucia Fabio (3 voti)" in page.locator("#voteActions").inner_text(), "Fabio in testa con 3 voti")
        page.click("#voteActions button:has-text('Brucia Fabio')")
        page.click("#confirmBtnYes")
        check(page.locator("#modalVote").is_hidden(), "votazione chiusa")
        check("bruciato Fabio" in guide(), "il passo del voto mostra il condannato")
        nxt()
        page.click("#guideStep button:has-text('Inizia la Notte 2')")

        print("Notte 2 guidata")
        check(page.locator(".guide-chip").count() == 6, "dalla seconda notte c'è anche il Medium")
        page.click(".guide-chip:has-text('Medium')")
        check(page.locator("#emptyCallCountdown").is_visible() and "Aspetta" in page.locator("#emptyCallCountdown").inner_text(), "Medium morto: chiamata a vuoto con attesa")
        page.evaluate("emptyCallTimer.endsAt = Date.now()")
        page.wait_for_timeout(400)
        check("Ora chiudi" in page.locator("#emptyCallCountdown").inner_text(), "fine dell'attesa")
        nxt()
        check(target("Bruno").is_disabled() and "ieri" in target("Bruno").inner_text(), "la Guardia non protegge due notti di fila la stessa persona")
        target("Elena").click()
        nxt()
        target("Elena").click()
        check("si salverà" in guide(), "i lupi scelgono chi è protetto: si salva")
        nxt()
        check("protetto" in guide() and "Manca la scelta" in guide(), "alba: salvataggio e scelta mancante del Veggente")
        page.click("#guideStep button:has-text('Fai sorgere il Giorno 2')")
        check("non è morto nessuno" in guide(), "annuncio: nessun morto")

        # ↩️ Fase: si torna indietro di più fasi
        for expected in ("Notte 2", "Giorno 1", "Notte 1"):
            page.click("#btnUndoTop")
            page.click("#confirmBtnYes")
            check(expected in page.locator("#narratorPhaseBadge").inner_text(), f"↩️ tornato a {expected}")
        check(page.locator("#btnUndoTop").is_disabled(), "↩️ spento alla prima fase")
        check("Fine della notte" in guide(), "si riprende dall'alba della notte 1 con le scelte fatte")
        page.click("#guideStep button:has-text('Fai sorgere il Giorno 1')")

        # Anna (lupo) al rogo dalla scheda Giocatori: vince il villaggio
        page.click("#tabBtnPlayers")
        cards = page.locator(".narrator-player-card")
        cards.nth(0).locator("button[title='Elimina / Uccidi giocatore']").click()
        page.click("#modalDeathCause button:has-text('Bruciato al rogo')")
        check("VILLAGGIO" in page.locator("#victoryBannerText").inner_text(), "lupo bruciato: vince il villaggio")

        # Interruttore "Morti e vittorie automatiche"
        page.click("#btnSettingsTop")
        page.click("#modalGameMenu label:has(#toggleAutoResolveInGame)")
        check(page.locator("#victoryBanner").is_hidden(), "automatismi spenti: niente vittoria automatica")
        page.click("#modalGameMenu label:has(#toggleAutoResolveInGame)")
        check(page.locator("#victoryBanner").is_visible(), "automatismi accesi: torna la vittoria")
        page.evaluate("closeGameMenuModal()")

        print("Riepilogo")
        page.click("#victoryBanner button:has-text('Riepilogo')")
        roles_txt = page.locator("#summaryRoles").inner_text()
        timeline_txt = page.locator("#summaryTimeline").inner_text()
        check("Anna" in roles_txt and "Lupo Mannaro" in roles_txt, "riepilogo: chi era chi")
        check("lupi hanno scelto Dario" in timeline_txt and "Veggente ha indagato su Anna" in timeline_txt, "cronologia: scelte della notte")
        check("Bruciato al rogo: Anna" in timeline_txt, "cronologia: rogo di Anna")
        page.evaluate("handleAndroidBack()")
        check(page.locator("#modalSummary").is_hidden(), "indietro chiude il riepilogo")
        page.click("text=✖ Continua")

        print("Anti-amnesia")
        cards.nth(1).locator("button[title='Mostra carta ruolo a questo giocatore']").click()
        check(page.locator("#modalAntiAmnesiaSafeView").is_visible(), "schermata coperta")
        shown, hidden = hold(page, "#btnAaReveal", "#aaStepCard")
        check(shown and hidden, "ruolo dell'anti-amnesia solo col dito premuto")
        check("Veggente" in page.locator("#aaRoleName").inner_text(), "ruolo giusto mostrato")
        page.click("text=Fatto, torna al Narratore")

        # Indietro sul cruscotto: chiede se uscire
        check(page.evaluate("handleAndroidBack()") is True, "indietro sul cruscotto gestito")
        check(page.locator("#modalConfirm").is_visible(), "chiede conferma prima di uscire")
        page.evaluate("handleAndroidBack()")
        check(page.locator("#modalConfirm").is_hidden(), "indietro chiude la finestra")

        # Ricarica: la partita resta
        page.reload()
        page.wait_for_load_state("networkidle")
        check(page.locator("#resumeBanner").is_visible(), "partita salvata dopo la riapertura")
        page.click("text=Riprendi Partita in Corso")
        check("Giorno 1" in page.locator("#narratorPhaseBadge").inner_text(), "ripresa al Giorno 1")

        # Torna al setup: chiede conferma solo se la partita non è finita (qui è finita: lupo morto)
        page.click("#btnSettingsTop")
        page.click("#modalGameMenu button:has-text('Torna al Setup')")
        check(page.locator("#screenSetup").is_visible(), "torna al setup")

        print("Ruoli e informazioni")
        page.click("text=Gestisci i ruoli")
        page.click("text=Crea Nuovo Ruolo")
        page.fill("#rfIcon", "🧑‍🌾")
        page.fill("#rfName", "Mugnaio")
        page.fill("#rfWhat", "Macina il grano.")
        page.click("text=Salva Ruolo")
        saved = page.evaluate("rolesDB.find(r => r.name === 'Mugnaio')")
        check(saved and saved["icon"] == "🧑‍🌾", "emoji composta salvata intera")

        # Ruolo personalizzato con azione notturna: la guida lo gestisce da sola
        page.click("text=Crea Nuovo Ruolo")
        page.fill("#rfName", "Strega")
        page.fill("#rfWhat", "Di notte avvelena un giocatore.")
        page.select_option("#rfWake", "mai")
        page.select_option("#rfNightAction", "kill")
        check(page.locator("#rfWake").input_value() == "ogni_notte", "con un'azione notturna si sveglia ogni notte")
        check(page.locator("#rfRulesBox").is_visible(), "regole della scelta visibili")
        page.check("#rfRuleNotSelf")
        page.click("text=Salva Ruolo")
        kinds = page.evaluate("""() => { const id = rolesDB.find(r => r.name === 'Strega').id;
          return buildNightPlan([{ id: 'x', name: 'X', roleId: id, isDead: false }, { id: 'y', name: 'Y', roleId: 'lupo', isDead: false }], rolesDB, 1).map(s => s.kind); }""")
        check(kinds == ["intro", "wolves", "kill", "dawn"], "la Strega ha il suo passo nella guida")
        check("uccide un giocatore" in page.locator("#editorRolesList").inner_text(), "l'elenco ruoli mostra cosa fa di notte")
        print("Condividere i ruoli")
        page.click("text=Condividi ruoli")
        check(page.locator("#shareRolesList input:checked").count() == 2, "preselezionati solo i ruoli creati")
        page.click("#btnShareRolesCopy")
        copied = page.evaluate("navigator.clipboard.readText()")
        check("LUPUS-RUOLI-1:" in copied and "Mugnaio" in copied, "messaggio copiato con il codice")
        page.evaluate("handleAndroidBack()")
        page.click("text=Importa ruoli")
        code = page.evaluate("""encodeRolesShare([{ name: 'Fornaio', icon: '🥖', faction: 'Villaggio', whatYouDo: 'Sforna il pane.', howYouWin: 'Col villaggio.', wakeTiming: 'mai', priority: 5 }, { name: 'Mugnaio', icon: '🌾', faction: 'Villaggio', whatYouDo: 'Testo nuovo.', howYouWin: 'Col villaggio.', wakeTiming: 'mai', priority: 5 }])""")
        page.fill("#importRolesText", "Ciao! " + code + " a presto")
        preview = page.locator("#importRolesPreview").inner_text()
        check("Fornaio" in preview and "nuovo" in preview and "aggiorna" in preview, "anteprima dell'importazione")
        page.click("#btnImportRolesConfirm")
        check(page.evaluate("rolesDB.some(r => r.name === 'Fornaio')"), "ruolo importato")
        check(page.evaluate("rolesDB.find(r => r.name === 'Mugnaio').whatYouDo") == "Testo nuovo.", "ruolo con lo stesso nome aggiornato")

        page.evaluate("handleAndroidBack()")
        check(page.locator("#screenSetup").is_visible(), "indietro dall'editor torna al setup")

        print("Guida")
        page.click("#screenSetup button:has-text('Guida')")
        guide = page.locator("#modalGuide").inner_text()
        check("come si gioca" in guide.lower() and "Lupo Mannaro" in guide and "Fornaio" in guide, "guida con regole e ruoli")
        page.evaluate("handleAndroidBack()")
        check(page.locator("#modalGuide").is_hidden(), "indietro chiude la guida")
        page.click("#btnInfoTop")
        check(page.locator("#modalInfo").is_visible(), "finestra informazioni")
        check("Versione" in page.locator("#infoVersion").inner_text(), "mostra la versione")
        page.evaluate("handleAndroidBack()")

        # Avviso aggiornamento simulato
        page.evaluate(
            """() => { localStorage.setItem('lupus_updates_v1', JSON.stringify({ lastCheck: new Date().toISOString(), latestVersion: '99.0.0', apkUrl: 'https://example.com/x.apk' })); renderUpdateBanner(); }"""
        )
        check(page.locator("#updateBanner").is_visible(), "avviso nuova versione")
        page.click("text=Più tardi")
        check(page.locator("#updateBanner").is_hidden(), "avviso nascosto con Più tardi")

        page.screenshot(path=str(DIST.parent / "tests" / "screenshot-setup.png"), full_page=False)
        browser.close()
    httpd.shutdown()

    real_errors = [e for e in errors if "favicon" not in e]
    if real_errors:
        print("ERRORI NELLA CONSOLE:\n" + "\n".join(real_errors))
        sys.exit(1)
    print("Tutto ok")


if __name__ == "__main__":
    main()

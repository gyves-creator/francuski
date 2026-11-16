// ─── Simulateurs Placements — Calcul JS pur (sans appel API) ─────────────────
(function () {
  'use strict';

  function fmt(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function fmtE(n) { return fmt(n) + ' €'; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // ─── 1. Simulateur Livret A ───────────────────────────────────────────────
  function calcLivretA(data, R) {
    const capital = parseFloat(data.capital);
    const versementMensuel = parseFloat(data.versement_mensuel) || 0;
    const duree = parseFloat(data.duree);
    if (!capital || capital < 0 || !duree || duree <= 0) return null;

    const taux = R.taux_livret_a; // 2,4%
    const plafond = R.plafond_livret_a; // 22 950€

    // Calcul avec intérêts bi-annuels (technique officielle du Livret A)
    // Approximation mensuelle pour la simulation
    const tauxMensuel = taux / 12;
    let solde = Math.min(capital, plafond);
    let totalInterets = 0;

    for (let m = 0; m < duree * 12; m++) {
      const versement = Math.min(versementMensuel, Math.max(0, plafond - solde));
      solde = round2(solde + versement);
      const interetsMensuel = round2(solde * tauxMensuel);
      solde = Math.min(round2(solde + interetsMensuel), plafond);
      totalInterets = round2(totalInterets + interetsMensuel);
    }

    const totalVerse = round2(capital + versementMensuel * duree * 12);
    const soldeEffectif = Math.min(solde, plafond);

    return {
      resultat: fmtE(soldeEffectif) + ` après ${duree} an(s)`,
      explication: `Avec ${fmtE(capital)} de capital initial et ${versementMensuel > 0 ? fmtE(versementMensuel) + '/mois de versements,' : 'sans versements,'} votre Livret A atteindra ${fmtE(soldeEffectif)} après ${duree} an(s) (taux ${(taux * 100).toFixed(1)}%, exonéré d'impôt). Intérêts générés : ${fmtE(totalInterets)}.`,
      details: [
        `Capital initial : ${fmtE(capital)}`,
        versementMensuel > 0 ? `Versement mensuel : ${fmtE(versementMensuel)}` : null,
        `Taux 2026 : ${(taux * 100).toFixed(1)}%`,
        `Durée : ${duree} an(s)`,
        `Plafond Livret A : ${fmtE(plafond)}`,
        capital > plafond ? `⚠️ Capital initial tronqué au plafond : ${fmtE(plafond)}` : null,
        `Total versé : ${fmtE(totalVerse)}`,
        `Intérêts générés : ${fmtE(totalInterets)}`,
        `Solde final : ${fmtE(soldeEffectif)}`,
        'Exonéré d\'IR et de prélèvements sociaux. Disponible à tout moment.',
      ].filter(Boolean)
    };
  }

  // ─── 2. Éligibilité LEP ───────────────────────────────────────────────────
  function calcEligibiliteLEP(data, R) {
    const revenusFiscaux = parseFloat(data.revenus_fiscaux);
    const nbParts = parseFloat(data.nb_parts) || 1;
    const capitalActuel = parseFloat(data.capital_actuel) || 0;
    if (!revenusFiscaux || revenusFiscaux < 0) return null;

    // Plafonds d'éligibilité LEP 2026 (revenus fiscaux N-1 par part)
    const plafonds = {
      1: 21393,
      1.5: 27167,
      2: 32941,
      2.5: 38715,
      3: 44489,
      3.5: 50263,
      4: 56037,
    };
    // Trouver le plafond par interpolation
    const plafondParParts = Object.entries(plafonds);
    let plafondApplicable = 0;
    for (const [parts, plafond] of plafondParParts) {
      if (nbParts <= parseFloat(parts)) { plafondApplicable = plafond; break; }
    }
    if (!plafondApplicable) plafondApplicable = 56037 + (nbParts - 4) * 5774;

    const eligible = revenusFiscaux <= plafondApplicable;
    const plafondLEP = R.plafond_lep; // 10 000€
    const tauxLEP = R.taux_lep; // 3,5%

    // Si éligible, simulation sur 5 ans
    let simulation = '';
    if (eligible) {
      const capital5ans = round2(Math.min(capitalActuel || plafondLEP, plafondLEP) * Math.pow(1 + tauxLEP, 5));
      simulation = `Simulation : ${fmtE(Math.min(capitalActuel || plafondLEP, plafondLEP))} placés → ${fmtE(capital5ans)} en 5 ans.`;
    }

    return {
      resultat: eligible ? '✅ Éligible au LEP' : '❌ Non éligible (revenus trop élevés)',
      explication: `Revenus fiscaux : ${fmtE(revenusFiscaux)} pour ${nbParts} part(s). Plafond : ${fmtE(plafondApplicable)}. ${eligible ? `Vous êtes éligible au LEP (taux ${(tauxLEP * 100).toFixed(1)}%, plafond ${fmtE(plafondLEP)}). ${simulation}` : `Vos revenus dépassent le plafond de ${fmtE(plafondApplicable)}.`}`,
      details: [
        `Revenus fiscaux de référence : ${fmtE(revenusFiscaux)}`,
        `Nombre de parts : ${nbParts}`,
        `Plafond d'éligibilité : ${fmtE(plafondApplicable)}`,
        `Éligibilité : ${eligible ? '✅ OUI' : '❌ NON'}`,
        eligible ? `Taux LEP 2026 : ${(tauxLEP * 100).toFixed(1)}% (vs ${(R.taux_livret_a * 100).toFixed(1)}% Livret A)` : null,
        eligible ? `Plafond du LEP : ${fmtE(plafondLEP)}` : null,
        eligible ? `Gain vs Livret A sur ${fmtE(plafondLEP)} en 1 an : +${fmtE(round2(plafondLEP * (tauxLEP - R.taux_livret_a)))}` : null,
        'Le LEP est réservé aux personnes aux revenus modestes. Exonéré d\'IR et PS.',
      ].filter(Boolean)
    };
  }

  // ─── 3. Calculateur intérêts composés ────────────────────────────────────
  function calcInteretsComposes(data) {
    const capital = parseFloat(data.capital);
    const versementMensuel = parseFloat(data.versement_mensuel) || 0;
    const taux = parseFloat(data.taux) / 100;
    const duree = parseFloat(data.duree);
    if (!capital || capital < 0 || !taux || !duree || duree <= 0) return null;

    const tauxMensuel = taux / 12;
    let solde = capital;
    let totalVerse = capital;

    // Simulation mois par mois
    for (let m = 0; m < duree * 12; m++) {
      solde = round2(solde * (1 + tauxMensuel) + versementMensuel);
      totalVerse = round2(totalVerse + versementMensuel);
    }

    const interets = round2(solde - totalVerse);
    const rendementTotal = round2((solde / capital - 1) * 100);

    // Projection sur 10/20/30 ans pour visualisation
    const projections = [];
    for (const ann of [5, 10, 20, 30]) {
      if (ann <= duree) continue;
      let s = capital;
      for (let m = 0; m < ann * 12; m++) s = round2(s * (1 + tauxMensuel) + versementMensuel);
      projections.push(`${ann} ans : ${fmtE(s)}`);
    }

    return {
      resultat: fmtE(solde) + ` après ${duree} an(s)`,
      explication: `Avec ${fmtE(capital)} de départ${versementMensuel > 0 ? ` + ${fmtE(versementMensuel)}/mois` : ''} à ${(taux * 100).toFixed(1)}%/an pendant ${duree} an(s), vos intérêts composés génèrent ${fmtE(interets)} d'intérêts pour un capital final de ${fmtE(solde)}.`,
      details: [
        `Capital initial : ${fmtE(capital)}`,
        versementMensuel > 0 ? `Versements mensuels : ${fmtE(versementMensuel)}` : null,
        `Taux annuel : ${(taux * 100).toFixed(2)}%`,
        `Durée : ${duree} an(s)`,
        `Total versé (hors intérêts) : ${fmtE(totalVerse)}`,
        `Intérêts composés générés : ${fmtE(interets)}`,
        `Capital final : ${fmtE(solde)}`,
        `Rendement total : +${rendementTotal}%`,
        ...projections,
        'La puissance des intérêts composés : Einstein les aurait qualifiés de "8e merveille du monde".',
      ].filter(Boolean)
    };
  }

  // ─── 4. PEA vs Assurance-vie ──────────────────────────────────────────────
  function calcPEAvsAssuranceVie(data, R) {
    const capital = parseFloat(data.capital);
    const versementMensuel = parseFloat(data.versement_mensuel) || 0;
    const taux = parseFloat(data.taux_rendement) / 100 || 0.07;
    const duree = parseFloat(data.duree) || 10;
    const tmi = parseFloat(data.tmi) / 100 || 0.30;
    if (!capital || capital <= 0 || duree <= 0) return null;

    const tauxMensuel = taux / 12;

    // ── PEA ──
    const plafondPEA = 150000;
    const capitalPEA = Math.min(capital, plafondPEA);
    let soldePEA = capitalPEA;
    for (let m = 0; m < duree * 12; m++) {
      const versement = Math.min(versementMensuel, Math.max(0, plafondPEA - soldePEA));
      soldePEA = round2((soldePEA + versement) * (1 + tauxMensuel));
    }
    const totalVersePEA = round2(capitalPEA + Math.min(versementMensuel * duree * 12, plafondPEA - capitalPEA));
    const plusValuePEA = round2(soldePEA - totalVersePEA);
    // PEA > 5 ans : exonération IR, PS 17,2% uniquement
    const fiscalitePEA = duree >= 5 ? round2(plusValuePEA * R.ps_taux) : round2(plusValuePEA * (tmi + R.ps_taux));
    const netPEA = round2(soldePEA - fiscalitePEA);

    // ── Assurance-vie ──
    let soldeAV = capital;
    for (let m = 0; m < duree * 12; m++) {
      soldeAV = round2((soldeAV + versementMensuel) * (1 + tauxMensuel));
    }
    const totalVerseAV = round2(capital + versementMensuel * duree * 12);
    const plusValueAV = round2(soldeAV - totalVerseAV);
    // AV > 8 ans : abattement 4 600€ (9 200€ couple) + PFU 7,5% + PS 17,2%
    const abattementAV = duree >= 8 ? 4600 : 0;
    const plusValueImposableAV = Math.max(0, round2(plusValueAV - abattementAV));
    const tauxIRAV = duree >= 8 ? 0.075 : (duree >= 4 ? tmi : tmi);
    const fiscaliteAV = round2(plusValueImposableAV * (tauxIRAV + R.ps_taux) + Math.min(abattementAV, plusValueAV) * R.ps_taux);
    const netAV = round2(soldeAV - fiscaliteAV);

    return {
      resultat: netPEA >= netAV ? `PEA : ${fmtE(netPEA)} net` : `Assurance-vie : ${fmtE(netAV)} net`,
      explication: `Sur ${duree} ans avec ${(taux * 100).toFixed(1)}% de rendement : PEA net de fiscalité = ${fmtE(netPEA)} | Assurance-vie net = ${fmtE(netAV)}. ${netPEA >= netAV ? 'Le PEA est plus avantageux fiscalement.' : 'L\'assurance-vie est plus avantageuse dans votre cas.'}`,
      details: [
        `Capital initial : ${fmtE(capital)}`,
        versementMensuel > 0 ? `Versement mensuel : ${fmtE(versementMensuel)}` : null,
        `Rendement annuel estimé : ${(taux * 100).toFixed(1)}%`,
        `Durée : ${duree} ans | TMI : ${(tmi * 100).toFixed(0)}%`,
        `── PEA (plafond ${fmtE(plafondPEA)}) ──`,
        `Solde brut : ${fmtE(soldePEA)}`,
        `Plus-value : ${fmtE(plusValuePEA)}`,
        `Fiscalité (${duree >= 5 ? 'PS 17,2% uniquement après 5 ans' : 'PFU 30%'}) : ${fmtE(fiscalitePEA)}`,
        `Net PEA : ${fmtE(netPEA)}`,
        `── Assurance-vie ──`,
        `Solde brut : ${fmtE(soldeAV)}`,
        `Plus-value : ${fmtE(plusValueAV)}`,
        `Abattement (${duree >= 8 ? '4 600€ après 8 ans' : 'non applicable'}) : ${fmtE(abattementAV)}`,
        `Fiscalité (${(tauxIRAV * 100).toFixed(1)}% + PS) : ${fmtE(fiscaliteAV)}`,
        `Net AV : ${fmtE(netAV)}`,
      ].filter(Boolean)
    };
  }

  // ─── 5. Simulateur DCA ────────────────────────────────────────────────────
  function calcDCA(data, R) {
    const versementMensuel = parseFloat(data.versement_mensuel);
    const duree = parseFloat(data.duree);
    const taux = parseFloat(data.taux_rendement) / 100 || R.taux_dca_mensuel_moyen;
    const capital_initial = parseFloat(data.capital_initial) || 0;
    if (!versementMensuel || versementMensuel <= 0 || !duree || duree <= 0) return null;

    const tauxMensuel = taux / 12;
    let portefeuille = capital_initial;
    const nbMois = Math.round(duree * 12);
    const historique = [];

    for (let m = 1; m <= nbMois; m++) {
      portefeuille = round2((portefeuille + versementMensuel) * (1 + tauxMensuel));
      if (m % 12 === 0) historique.push(`An ${m / 12} : ${fmtE(portefeuille)}`);
    }

    const totalInvesti = round2(capital_initial + versementMensuel * nbMois);
    const plusValue = round2(portefeuille - totalInvesti);
    const rendementTotal = round2((portefeuille / totalInvesti - 1) * 100);

    // Sans DCA (investissement unique au départ)
    const sansDCA = round2(totalInvesti * Math.pow(1 + taux, duree));
    const avantageDCA = round2(portefeuille - sansDCA);

    return {
      resultat: fmtE(portefeuille) + ` après ${duree} an(s)`,
      explication: `En investissant ${fmtE(versementMensuel)}/mois pendant ${duree} ans (${(taux * 100).toFixed(1)}%/an de rendement moyen), votre portefeuille atteindra ${fmtE(portefeuille)}. Total investi : ${fmtE(totalInvesti)}, plus-value : ${fmtE(plusValue)} (+${rendementTotal}%).`,
      details: [
        capital_initial > 0 ? `Capital initial : ${fmtE(capital_initial)}` : null,
        `Versement mensuel (DCA) : ${fmtE(versementMensuel)}`,
        `Rendement annuel moyen : ${(taux * 100).toFixed(1)}%`,
        `Durée : ${duree} an(s) (${nbMois} versements)`,
        `Total investi : ${fmtE(totalInvesti)}`,
        `Plus-value générée : ${fmtE(plusValue)}`,
        `Portefeuille final : ${fmtE(portefeuille)}`,
        `Rendement total : +${rendementTotal}%`,
        ...historique.slice(0, 6),
        'Le DCA (Dollar Cost Averaging) lisse le risque d\'entrée sur les marchés.',
        'Rendement moyen MSCI World sur 30 ans : ~7%/an (net inflation).',
      ].filter(Boolean)
    };
  }

  // ─── Registre ────────────────────────────────────────────────────────────
  if (!window.CALCULATEURS_JS) window.CALCULATEURS_JS = {};
  Object.assign(window.CALCULATEURS_JS, {
    'simulateur-livret-a':          function(d) { return calcLivretA(d, window.RATES); },
    'eligibilite-lep':              function(d) { return calcEligibiliteLEP(d, window.RATES); },
    'calculateur-interets-composes':function(d) { return calcInteretsComposes(d); },
    'comparateur-pea-assurance-vie':function(d) { return calcPEAvsAssuranceVie(d, window.RATES); },
    'simulateur-dca':               function(d) { return calcDCA(d, window.RATES); },
  });

})();

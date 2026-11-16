// ─── Simulateurs Entreprise — Calcul JS pur (sans appel API) ─────────────────
(function () {
  'use strict';

  function fmt(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function fmtE(n) { return fmt(n) + ' €'; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // Calcul IR barème progressif (réutilisable)
  function calcIRBrut(revenuNet, R) {
    const tranches = [
      { min: 0,       max: R.taux_ir.tranche_1.max, taux: 0 },
      { min: R.taux_ir.tranche_1.max, max: R.taux_ir.tranche_2.max, taux: R.taux_ir.tranche_2.taux },
      { min: R.taux_ir.tranche_2.max, max: R.taux_ir.tranche_3.max, taux: R.taux_ir.tranche_3.taux },
      { min: R.taux_ir.tranche_3.max, max: R.taux_ir.tranche_4.max, taux: R.taux_ir.tranche_4.taux },
      { min: R.taux_ir.tranche_4.max, max: 1e9, taux: R.taux_ir.tranche_5.taux },
    ];
    let impot = 0;
    for (const t of tranches) {
      if (revenuNet <= t.min) break;
      impot += (Math.min(revenuNet, t.max) - t.min) * t.taux;
    }
    return round2(impot);
  }

  // ─── 1. Comparateur SASU vs EURL ─────────────────────────────────────────
  function calcSASUvsEURL(data, R) {
    const ca = parseFloat(data.ca);
    const charges = parseFloat(data.charges) || 0;
    const remuneration = parseFloat(data.remuneration) || 0;
    if (!ca || ca <= 0) return null;

    const resultatAvantRemuneration = round2(ca - charges);

    // ── SASU ──
    // Dirigeant assimilé salarié : cotisations ~82% du brut (dont patronales ~42% + salariales ~22%)
    const cotisationsAssimileSalarie = round2(remuneration * (R.cotisations_patronales + R.cotisations_salariales));
    const remunerationNeteSASU = round2(remuneration * (1 - R.cotisations_salariales));
    const chargesSocSASU = round2(remuneration * R.cotisations_patronales);
    const resultatSASU = round2(resultatAvantRemuneration - remuneration - chargesSocSASU);
    const isSASU = resultatSASU > 0 ? round2(Math.min(resultatSASU, 42500) * 0.15 + Math.max(0, resultatSASU - 42500) * 0.25) : 0;
    const resultatNetSASU = round2(resultatSASU - isSASU);
    const dividendesSASU = resultatNetSASU > 0 ? round2(resultatNetSASU * 0.70) : 0; // PFU 30%
    const revenuTotalNetSASU = round2(remunerationNeteSASU + dividendesSASU);

    // ── EURL (gérant TNS) ──
    // Cotisations TNS : ~45% du bénéfice (régime SSI)
    const tauxCotTNS = 0.45;
    const resultatEURL = round2(resultatAvantRemuneration - remuneration);
    const cotTNS = round2(remuneration * tauxCotTNS);
    const remunerationNeteEURL = round2(remuneration - cotTNS);
    const beneficeEURL = round2(resultatEURL - cotTNS);
    const irEURL = calcIRBrut(Math.max(0, beneficeEURL + remunerationNeteEURL), R);
    const revenuTotalNetEURL = round2(remunerationNeteEURL - irEURL + Math.max(0, beneficeEURL));

    return {
      resultat: revenuTotalNetSASU > revenuTotalNetEURL ? 'SASU plus avantageuse' : 'EURL plus avantageuse',
      explication: `CA : ${fmtE(ca)} | Rémunération dirigeant : ${fmtE(remuneration)}/mois. SASU : revenu net total ~${fmtE(revenuTotalNetSASU)}/mois. EURL : ~${fmtE(revenuTotalNetEURL)}/mois. ${revenuTotalNetSASU > revenuTotalNetEURL ? 'La SASU est plus avantageuse dans votre cas.' : 'L\'EURL est plus avantageuse dans votre cas.'}`,
      details: [
        `Chiffre d'affaires : ${fmtE(ca)}`,
        `Charges d'exploitation : ${fmtE(charges)}`,
        `Rémunération brute dirigeant : ${fmtE(remuneration)}/mois`,
        `── SASU (assimilé salarié) ──`,
        `Cotisations sociales patronales : ${fmtE(chargesSocSASU)}/mois`,
        `Salaire net dirigeant : ${fmtE(remunerationNeteSASU)}/mois`,
        `Résultat avant IS : ${fmtE(resultatSASU)}`,
        `IS estimé (15%/25%) : ${fmtE(isSASU)}`,
        `Dividendes nets (après PFU 30%) : ${fmtE(dividendesSASU)}`,
        `Revenu total net SASU : ${fmtE(revenuTotalNetSASU)}/mois`,
        `── EURL (gérant TNS) ──`,
        `Cotisations TNS (~45%) : ${fmtE(cotTNS)}/mois`,
        `Rémunération nette TNS : ${fmtE(remunerationNeteEURL)}/mois`,
        `IR estimé : ${fmtE(irEURL)}`,
        `Revenu total net EURL : ${fmtE(revenuTotalNetEURL)}/mois`,
      ]
    };
  }

  // ─── 2. Simulateur micro-entrepreneur ────────────────────────────────────
  function calcMicroEntrepreneur(data, R) {
    const ca = parseFloat(data.ca);
    const type = data.type || 'bic_service';
    if (!ca || ca <= 0) return null;

    // Plafonds et taux selon activité
    const config = {
      bic_vente:   { plafond: R.micro_entrepreneur_plafond_bic, cotisations: R.micro_entrepreneur_cotisations_bic, abattement: R.micro_entrepreneur_abattement_bic, label: 'Vente (BIC)' },
      bic_service: { plafond: R.micro_entrepreneur_plafond_bic / 2.4, cotisations: 0.214, abattement: 0.50, label: 'Services (BIC)' },
      bnc:         { plafond: R.micro_entrepreneur_plafond_bnc, cotisations: R.micro_entrepreneur_cotisations_bnc, abattement: R.micro_entrepreneur_abattement_bnc, label: 'Libéral (BNC)' },
    };
    const c = config[type] || config.bic_service;

    if (ca > c.plafond) {
      return {
        resultat: 'CA dépasse le plafond micro',
        explication: `Votre CA de ${fmtE(ca)}/mois (${fmtE(round2(ca * 12))}/an) dépasse le plafond micro-entrepreneur de ${fmtE(c.plafond)}/an pour l'activité ${c.label}. Vous devez passer en régime réel.`,
        details: [`Plafond micro-entrepreneur (${c.label}) : ${fmtE(c.plafond)}/an`, `Votre CA annuel : ${fmtE(round2(ca * 12))}/an`]
      };
    }

    const cotisations = round2(ca * c.cotisations);
    const caAnnuel = round2(ca * 12);
    const cotisationsAnnuelles = round2(cotisations * 12);

    // Bénéfice imposable (après abattement)
    const abattement = round2(ca * c.abattement);
    const beneficeImposable = Math.max(0, round2(ca - abattement));
    const beneficeImposableAnnuel = round2(beneficeImposable * 12);

    // IR (versement libératoire ou barème)
    const tauxVL = type === 'bic_vente' ? 0.01 : type === 'bic_service' ? 0.017 : 0.022;
    const irVL = round2(ca * tauxVL);
    const irBareme = round2(beneficeImposable * 0.11); // tranche 11% environ

    const revenuNet = round2(ca - cotisations - irVL);

    return {
      resultat: fmtE(revenuNet) + ' net / mois',
      explication: `CA de ${fmtE(ca)}/mois en ${c.label}. Après cotisations (${(c.cotisations * 100).toFixed(1)}%) et versement libératoire IR, votre revenu net est d'environ ${fmtE(revenuNet)}/mois.`,
      details: [
        `Chiffre d'affaires mensuel : ${fmtE(ca)}`,
        `Type d'activité : ${c.label}`,
        `Taux de cotisations : ${(c.cotisations * 100).toFixed(1)}%`,
        `Cotisations mensuelles : ${fmtE(cotisations)}`,
        `Abattement forfaitaire (${(c.abattement * 100).toFixed(0)}%) : ${fmtE(abattement)}`,
        `Bénéfice imposable : ${fmtE(beneficeImposable)}/mois`,
        `IR versement libératoire (${(tauxVL * 100).toFixed(1)}%) : ${fmtE(irVL)}/mois`,
        `Revenu net mensuel : ${fmtE(revenuNet)}`,
        `CA annuel : ${fmtE(caAnnuel)}`,
        `Cotisations annuelles : ${fmtE(cotisationsAnnuelles)}`,
        `Plafond ${c.label} : ${fmtE(c.plafond)}/an`,
      ]
    };
  }

  // ─── 3. Dividendes vs Salaire ─────────────────────────────────────────────
  function calcDividendesVsSalaire(data, R) {
    const montant = parseFloat(data.montant);
    const tmi = parseFloat(data.tmi) / 100 || 0.30;
    if (!montant || montant <= 0) return null;

    // ── Option salaire ──
    const cotisationsPatronales = round2(montant * R.cotisations_patronales);
    const brutSalarie = round2(montant / (1 + R.cotisations_patronales)); // coût total = brut × (1 + charges patronales)
    const cotisationsSalariales = round2(brutSalarie * R.cotisations_salariales);
    const netSalarie = round2(brutSalarie - cotisationsSalariales);
    const irSalaire = round2(netSalarie * tmi * 0.9); // abattement 10% FP
    const revenuNetSalaire = round2(netSalarie - irSalaire);

    // Protection sociale du salarié (retraite, chômage, prévoyance)
    const droitsSociaux = 'Retraite, chômage, prévoyance inclus';

    // ── Option dividendes (à partir de résultat net IS) ──
    // Résultat avant IS : on part de la même enveloppe (montant = trésorerie dispo)
    const is = round2(Math.min(montant, 42500) * 0.15 + Math.max(0, montant - 42500) * 0.25);
    const resultatNetIS = round2(montant - is);
    // PFU 30%
    const pfu = round2(resultatNetIS * 0.30);
    const dividendesNets = round2(resultatNetIS - pfu);

    // Barème avec abattement 40%
    const baseBareme = round2(resultatNetIS * 0.60);
    const irBareme = round2(baseBareme * tmi);
    const psBareme = round2(resultatNetIS * R.ps_taux);
    const dividendesNetsBareme = round2(resultatNetIS - irBareme - psBareme + round2(resultatNetIS * 0.068 * tmi));

    return {
      resultat: revenuNetSalaire >= dividendesNets ? 'Salaire plus avantageux' : 'Dividendes plus avantageux',
      explication: `Pour ${fmtE(montant)} d'enveloppe brute : Salaire net ~${fmtE(revenuNetSalaire)} | Dividendes nets (PFU) ~${fmtE(dividendesNets)}. ${revenuNetSalaire >= dividendesNets ? 'Le versement en salaire est plus avantageux' : 'Les dividendes sont plus avantageux'} pour votre TMI de ${(tmi * 100).toFixed(0)}%.`,
      details: [
        `Enveloppe totale : ${fmtE(montant)}`,
        `TMI : ${(tmi * 100).toFixed(0)}%`,
        `── Option Salaire ──`,
        `Salaire brut : ${fmtE(brutSalarie)}`,
        `Charges patronales : ${fmtE(cotisationsPatronales)}`,
        `Charges salariales : ${fmtE(cotisationsSalariales)}`,
        `Salaire net : ${fmtE(netSalarie)}`,
        `IR estimé : -${fmtE(irSalaire)}`,
        `Revenu net après IR : ${fmtE(revenuNetSalaire)}`,
        `Avantage : ${droitsSociaux}`,
        `── Option Dividendes (IS + PFU) ──`,
        `IS estimé (15%/25%) : -${fmtE(is)}`,
        `Résultat net après IS : ${fmtE(resultatNetIS)}`,
        `PFU (30%) : -${fmtE(pfu)}`,
        `Dividendes nets (PFU) : ${fmtE(dividendesNets)}`,
        `Dividendes nets (barème) : ${fmtE(dividendesNetsBareme)}`,
        'Inconvénient dividendes : pas de cotisations retraite ni chômage.',
      ]
    };
  }

  // ─── 4. Coût d'un salarié ─────────────────────────────────────────────────
  function calcCoutSalarie(data, R) {
    const brut = parseFloat(data.salaire_brut);
    if (!brut || brut <= 0) return null;

    const chargesPatronales = round2(brut * R.cotisations_patronales);
    const coutTotal = round2(brut + chargesPatronales);
    const coutAnnuel = round2(coutTotal * 12);

    // Cotisations salariales (info salarié)
    const cotSalariales = round2(brut * R.cotisations_salariales);
    const netSalarie = round2(brut - cotSalariales);

    // Réductions patronales (Fillon) pour salaires ≤ 1,6 SMIC
    let reductionFillon = 0;
    if (brut <= R.smic_brut * 1.6) {
      const coef = round2((0.3214 / 0.6) * (1.6 * R.smic_brut / brut - 1));
      reductionFillon = round2(brut * Math.min(coef, 0.3214));
    }
    const coutNetReduction = round2(coutTotal - reductionFillon);
    const coutAnnuelNet = round2(coutNetReduction * 12);

    return {
      resultat: fmtE(coutNetReduction) + ' / mois',
      explication: `Un salarié à ${fmtE(brut)} brut/mois coûte ${fmtE(coutTotal)}/mois (charges patronales ~${(R.cotisations_patronales * 100).toFixed(0)}%). ${reductionFillon > 0 ? `Après réduction Fillon de ${fmtE(reductionFillon)}, le coût réel est de ${fmtE(coutNetReduction)}/mois.` : ''}`,
      details: [
        `Salaire brut : ${fmtE(brut)}/mois`,
        `Charges patronales (~${(R.cotisations_patronales * 100).toFixed(0)}%) : +${fmtE(chargesPatronales)}`,
        `Coût total brut : ${fmtE(coutTotal)}/mois`,
        reductionFillon > 0 ? `Réduction Fillon : -${fmtE(reductionFillon)}` : 'Réduction Fillon : non applicable (> 1,6 SMIC)',
        `Coût net employeur : ${fmtE(coutNetReduction)}/mois`,
        `Coût annuel employeur : ${fmtE(coutAnnuelNet)}`,
        `── Vue salarié ──`,
        `Salaire brut : ${fmtE(brut)}`,
        `Cotisations salariales (${(R.cotisations_salariales * 100).toFixed(2)}%) : -${fmtE(cotSalariales)}`,
        `Salaire net à payer : ${fmtE(netSalarie)}/mois`,
        `Rapport net/coût employeur : ${round2(netSalarie / coutNetReduction * 100)}%`,
      ]
    };
  }

  // ─── 5. Portage salarial ──────────────────────────────────────────────────
  function calcPortageSalarial(data, R) {
    const tjm = parseFloat(data.tjm);
    const nbJours = parseFloat(data.nb_jours) || 18;
    if (!tjm || tjm <= 0 || nbJours <= 0) return null;

    const caHT = round2(tjm * nbJours);

    // Frais de gestion société de portage : ~10%
    const fraisGestion = round2(caHT * R.portage_salarial_taux_gestion);
    const baseRemuneration = round2(caHT - fraisGestion);

    // Charges patronales
    const brutEstime = round2(baseRemuneration / (1 + R.cotisations_patronales));
    const chargesPatronales = round2(brutEstime * R.cotisations_patronales);
    const cotisationsSalariales = round2(brutEstime * R.cotisations_salariales);
    const netSalarie = round2(brutEstime - cotisationsSalariales);
    const netMensuel = netSalarie;

    const txNet = round2(netMensuel / caHT * 100);

    return {
      resultat: fmtE(netMensuel) + ' net / mois',
      explication: `Avec ${nbJours} jours facturés à ${fmtE(tjm)}/jour (CA HT : ${fmtE(caHT)}), votre revenu net en portage salarial est d'environ ${fmtE(netMensuel)}/mois, soit ${txNet}% de votre CA.`,
      details: [
        `TJM HT : ${fmtE(tjm)}/jour`,
        `Jours facturés par mois : ${nbJours}`,
        `CA mensuel HT : ${fmtE(caHT)}`,
        `Frais de gestion (${(R.portage_salarial_taux_gestion * 100).toFixed(0)}%) : -${fmtE(fraisGestion)}`,
        `Base de rémunération : ${fmtE(baseRemuneration)}`,
        `Salaire brut estimé : ${fmtE(brutEstime)}`,
        `Charges patronales : -${fmtE(chargesPatronales)}`,
        `Charges salariales : -${fmtE(cotisationsSalariales)}`,
        `Net mensuel : ${fmtE(netMensuel)}`,
        `Taux de conversion CA → net : ${txNet}%`,
        'Avantage : statut salarié complet (chômage, retraite, prévoyance).',
      ]
    };
  }

  // ─── Registre ────────────────────────────────────────────────────────────
  if (!window.CALCULATEURS_JS) window.CALCULATEURS_JS = {};
  Object.assign(window.CALCULATEURS_JS, {
    'comparateur-sasu-eurl':       function(d) { return calcSASUvsEURL(d, window.RATES); },
    'simulateur-micro-entrepreneur':function(d) { return calcMicroEntrepreneur(d, window.RATES); },
    'calcul-dividendes-vs-salaire': function(d) { return calcDividendesVsSalaire(d, window.RATES); },
    'calcul-cout-salarie':          function(d) { return calcCoutSalarie(d, window.RATES); },
    'simulateur-portage-salarial':  function(d) { return calcPortageSalarial(d, window.RATES); },
  });

})();

// ─── Simulateurs Fiscalité — Calcul JS pur (sans appel API) ──────────────────
(function () {
  'use strict';

  function fmt(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function fmtE(n) { return fmt(n) + ' €'; }
  function round2(n) { return Math.round(n * 100) / 100; }

  // Calcul IR barème progressif
  function calcIR(revenuImposable, R) {
    const tranches = [
      { min: 0,      max: R.taux_ir.tranche_1.max, taux: 0 },
      { min: R.taux_ir.tranche_1.max, max: R.taux_ir.tranche_2.max, taux: R.taux_ir.tranche_2.taux },
      { min: R.taux_ir.tranche_2.max, max: R.taux_ir.tranche_3.max, taux: R.taux_ir.tranche_3.taux },
      { min: R.taux_ir.tranche_3.max, max: R.taux_ir.tranche_4.max, taux: R.taux_ir.tranche_4.taux },
      { min: R.taux_ir.tranche_4.max, max: R.taux_ir.tranche_5.max || 1e9, taux: R.taux_ir.tranche_5.taux },
    ];
    let impot = 0;
    let details = [];
    for (const t of tranches) {
      if (revenuImposable <= t.min) break;
      const base = Math.min(revenuImposable, t.max) - t.min;
      const part = round2(base * t.taux);
      impot += part;
      if (t.taux > 0 && base > 0) details.push(`Tranche ${(t.taux * 100).toFixed(0)}% (${fmt(t.min)}€ - ${t.max < 1e8 ? fmt(t.max) + '€' : '∞'}) : ${fmtE(part)}`);
    }
    return { impot: round2(impot), details };
  }

  // ─── 1. Simulateur Impôt sur le revenu ──────────────────────────────────
  function calcImpotRevenu(data, R) {
    const revenus = parseFloat(data.revenus);
    const situation = data.situation || 'celibataire';
    if (!revenus || revenus <= 0) return null;

    const nbParts = R.quotient_familial[situation] || 1;

    // Abattement 10% frais professionnels (plafonné à 14 426€, minimum 495€)
    const abattementFP = Math.min(Math.max(round2(revenus * 0.10), 495), 14426);
    const revenuNet = round2(revenus - abattementFP);

    // Quotient familial
    const revenuParPart = round2(revenuNet / nbParts);
    const { impot: impotParPart, details: detailsTranches } = calcIR(revenuParPart, R);
    const impotBrut = round2(impotParPart * nbParts);

    // Décote (si impôt < seuils)
    let decote = 0;
    if (nbParts === 1 && impotBrut < 1929) {
      decote = round2(Math.max(0, 873 - impotBrut * 0.4525));
    } else if (nbParts >= 2 && impotBrut < 3191) {
      decote = round2(Math.max(0, 1444 - impotBrut * 0.4525));
    }

    const impotNet = Math.max(0, round2(impotBrut - decote));
    const tauxMoyen = revenus > 0 ? round2(impotNet / revenus * 100) : 0;
    const tauxMarginal = revenuParPart <= R.taux_ir.tranche_1.max ? 0
      : revenuParPart <= R.taux_ir.tranche_2.max ? 11
      : revenuParPart <= R.taux_ir.tranche_3.max ? 30
      : revenuParPart <= R.taux_ir.tranche_4.max ? 41 : 45;

    return {
      resultat: fmtE(impotNet) + ' / an',
      explication: `Pour ${fmtE(revenus)} de revenus nets (situation : ${situation.replace(/_/g, ' ')}), votre impôt sur le revenu 2026 est estimé à ${fmtE(impotNet)}. Taux moyen : ${tauxMoyen}%, Tranche marginale : ${tauxMarginal}%.`,
      details: [
        `Revenus nets déclarés : ${fmtE(revenus)}`,
        `Abattement 10% (frais pro) : -${fmtE(abattementFP)}`,
        `Revenu net imposable : ${fmtE(revenuNet)}`,
        `Nombre de parts fiscales : ${nbParts}`,
        `Revenu par part : ${fmtE(revenuParPart)}`,
        ...detailsTranches,
        `Impôt brut : ${fmtE(impotBrut)}`,
        decote > 0 ? `Décote : -${fmtE(decote)}` : null,
        `Impôt net à payer : ${fmtE(impotNet)}`,
        `Taux moyen d'imposition : ${tauxMoyen}%`,
        `Tranche marginale d'imposition : ${tauxMarginal}%`,
        `Mensuel via prélèvement à la source : ~${fmtE(round2(impotNet / 12))}`,
      ].filter(Boolean)
    };
  }

  // ─── 2. Prélèvement à la source ──────────────────────────────────────────
  function calcPrelevementSource(data, R) {
    const revenus = parseFloat(data.revenus);
    const situation = data.situation || 'celibataire';
    if (!revenus || revenus <= 0) return null;

    const nbParts = R.quotient_familial[situation] || 1;
    const abattement = Math.min(Math.max(round2(revenus * 0.10), 495), 14426);
    const revenuNet = round2(revenus - abattement);
    const revenuParPart = round2(revenuNet / nbParts);
    const { impot: impotParPart } = calcIR(revenuParPart, R);
    const impotAnnuel = round2(impotParPart * nbParts);

    // Taux PAS = impôt net / revenus bruts
    const tauxPAS = revenus > 0 ? round2(impotAnnuel / revenus * 100) : 0;
    const prelevementMensuel = round2(revenus / 12 * tauxPAS / 100);

    return {
      resultat: `${tauxPAS}% — ${fmtE(prelevementMensuel)} / mois`,
      explication: `Votre taux de prélèvement à la source est de ${tauxPAS}%, soit ${fmtE(prelevementMensuel)}/mois prélevé directement sur votre salaire (base annuelle ${fmtE(revenus)}).`,
      details: [
        `Revenus nets annuels : ${fmtE(revenus)}`,
        `Situation familiale : ${situation.replace(/_/g, ' ')} (${nbParts} parts)`,
        `Impôt annuel estimé : ${fmtE(impotAnnuel)}`,
        `Taux PAS : ${tauxPAS}%`,
        `Prélèvement mensuel : ${fmtE(prelevementMensuel)}`,
        `Revenu mensuel net après PAS : ${fmtE(round2(revenus / 12 - prelevementMensuel))}`,
        'Le taux PAS est calculé sur vos revenus N-2 et ajusté en N+1.',
      ]
    };
  }

  // ─── 3. Plus-value mobilière ─────────────────────────────────────────────
  function calcPlusValueMobiliere(data, R) {
    const prixAchat = parseFloat(data.prix_achat);
    const prixVente = parseFloat(data.prix_vente);
    const fraisAchat = parseFloat(data.frais_achat) || 0;
    const option = data.option || 'pfu'; // PFU ou bareme
    if (!prixAchat || !prixVente || prixVente <= 0) return null;

    const plusValue = round2(prixVente - prixAchat - fraisAchat);
    if (plusValue <= 0) {
      return {
        resultat: '0 € (moins-value)',
        explication: `La vente génère une moins-value de ${fmtE(Math.abs(plusValue))} qui peut être imputée sur des plus-values de même nature pendant 10 ans.`,
        details: [`Prix d'achat + frais : ${fmtE(round2(prixAchat + fraisAchat))}`, `Prix de vente : ${fmtE(prixVente)}`, `Moins-value : ${fmtE(Math.abs(plusValue))}`]
      };
    }

    // PFU (Flat Tax) : 30% = 12,8% IR + 17,2% PS
    const impotPFU = round2(plusValue * R.plus_value_mobiliere_taux_flat);
    const irPFU = round2(plusValue * 0.128);
    const psPFU = round2(plusValue * R.ps_taux);

    // Barème progressif
    const irBareme = round2(plusValue * 0.30); // approx TMI 30%
    const psBareme = round2(plusValue * R.ps_taux);
    const totalBareme = round2(irBareme + psBareme);

    const impotFinal = option === 'pfu' ? impotPFU : totalBareme;
    const gainNet = round2(plusValue - impotFinal);

    return {
      resultat: fmtE(impotFinal) + ` d'impôt (${option === 'pfu' ? 'PFU 30%' : 'barème'})`,
      explication: `Votre plus-value mobilière est de ${fmtE(plusValue)}. Au régime PFU (Flat Tax 30%) : ${fmtE(impotPFU)} d'impôt. Gain net : ${fmtE(gainNet)}.`,
      details: [
        `Prix d'achat : ${fmtE(prixAchat)}`,
        fraisAchat > 0 ? `Frais d'acquisition : ${fmtE(fraisAchat)}` : null,
        `Prix de vente : ${fmtE(prixVente)}`,
        `Plus-value brute : ${fmtE(plusValue)}`,
        `── PFU (Flat Tax 30%) ──`,
        `IR (12,8%) : ${fmtE(irPFU)}`,
        `Prélèvements sociaux (17,2%) : ${fmtE(psPFU)}`,
        `Total PFU : ${fmtE(impotPFU)}`,
        `── Barème progressif (estimé TMI 30%) ──`,
        `IR (30%) : ${fmtE(irBareme)}`,
        `PS (17,2%) : ${fmtE(psBareme)}`,
        `Total barème : ${fmtE(totalBareme)}`,
        `Solution la plus avantageuse : ${impotPFU <= totalBareme ? 'PFU' : 'Barème progressif'}`,
        `Gain net (option ${option === 'pfu' ? 'PFU' : 'barème'}) : ${fmtE(gainNet)}`,
      ].filter(Boolean)
    };
  }

  // ─── 4. Simulateur dividendes ────────────────────────────────────────────
  function calcDividendes(data, R) {
    const montant = parseFloat(data.montant);
    const option = data.option || 'pfu';
    const tmi = parseFloat(data.tmi) / 100 || 0.30;
    if (!montant || montant <= 0) return null;

    // PFU 30% = 12,8% IR + 17,2% PS
    const irPFU = round2(montant * 0.128);
    const psPFU = round2(montant * R.ps_taux);
    const totalPFU = round2(irPFU + psPFU);

    // Barème : abattement 40% sur les dividendes d'IS
    const abattement40 = round2(montant * 0.40);
    const baseImposable = round2(montant - abattement40);
    const irBareme = round2(baseImposable * tmi);
    // PS sur montant brut (sans abattement)
    const psBareme = round2(montant * R.ps_taux);
    // CSG déductible 6,8%
    const csgDed = round2(montant * 0.068);
    const totalBareme = round2(irBareme + psBareme - csgDed * tmi);

    const impotFinal = option === 'pfu' ? totalPFU : totalBareme;
    const netFinal = round2(montant - impotFinal);

    return {
      resultat: fmtE(netFinal) + ' net',
      explication: `Sur ${fmtE(montant)} de dividendes, l'impôt au ${option === 'pfu' ? 'PFU (30%)' : `barème progressif (TMI ${(tmi * 100).toFixed(0)}%)`} est de ${fmtE(impotFinal)}. Vous percevez ${fmtE(netFinal)} net.`,
      details: [
        `Dividendes bruts : ${fmtE(montant)}`,
        `── PFU (Flat Tax 30%) ──`,
        `IR (12,8%) : ${fmtE(irPFU)}`,
        `PS (17,2%) : ${fmtE(psPFU)}`,
        `Total PFU : ${fmtE(totalPFU)}`,
        `── Barème progressif (TMI ${(tmi * 100).toFixed(0)}%) ──`,
        `Abattement 40% : -${fmtE(abattement40)}`,
        `IR sur base nette : ${fmtE(irBareme)}`,
        `PS (17,2%) : ${fmtE(psBareme)}`,
        `CSG déductible restituée : -${fmtE(round2(csgDed * tmi))}`,
        `Total barème : ${fmtE(totalBareme)}`,
        `Solution optimale : ${totalPFU <= totalBareme ? 'PFU' : 'Barème progressif'}`,
        `Net perçu (option ${option === 'pfu' ? 'PFU' : 'barème'}) : ${fmtE(netFinal)}`,
      ]
    };
  }

  // ─── 5. Droits de succession ──────────────────────────────────────────────
  function calcDroitsSuccession(data, R) {
    const actifNet = parseFloat(data.actif_net);
    const lien = data.lien || 'enfant';
    const nbHeritiers = parseInt(data.nb_heritiers) || 1;
    if (!actifNet || actifNet <= 0) return null;

    // Abattements légaux
    const abattements = {
      enfant: R.abattement_succession_enfant, // 100 000€
      conjoint: 0, // exonéré totalement
      frere_soeur: 15932,
      neveu_niece: 7967,
      autre: 1594,
    };
    const abattement = abattements[lien] || abattements.autre;
    if (lien === 'conjoint') {
      return {
        resultat: '0 € (exonéré)',
        explication: 'Le conjoint ou partenaire de PACS survivant est totalement exonéré de droits de succession depuis la loi TEPA de 2007.',
        details: ['Exonération totale pour le conjoint / PACS.', `Actif net de la succession : ${fmtE(actifNet)}`]
      };
    }

    const partParHeritier = round2(actifNet / nbHeritiers);
    const baseImposable = Math.max(0, round2(partParHeritier - abattement));

    // Barème (succession en ligne directe enfant)
    const baremes = lien === 'enfant' ? [
      { max: R.droits_succession_tranche1.max, taux: R.droits_succession_tranche1.taux },
      { max: R.droits_succession_tranche2.max, taux: R.droits_succession_tranche2.taux },
      { max: R.droits_succession_tranche3.max, taux: R.droits_succession_tranche3.taux },
      { max: R.droits_succession_tranche4.max, taux: R.droits_succession_tranche4.taux },
      { max: R.droits_succession_tranche5.max, taux: R.droits_succession_tranche5.taux },
      { max: R.droits_succession_tranche6.max, taux: R.droits_succession_tranche6.taux },
      { max: 1e9, taux: R.droits_succession_tranche7.taux },
    ] : [{ max: 1e9, taux: lien === 'frere_soeur' ? 0.35 : 0.55 }];

    let droits = 0;
    let prev = 0;
    for (const b of baremes) {
      if (baseImposable <= prev) break;
      const base = Math.min(baseImposable, b.max) - prev;
      droits += base * b.taux;
      prev = b.max;
    }
    droits = round2(droits);
    const droitsTotaux = round2(droits * nbHeritiers);
    const netRecuParHeritier = round2(partParHeritier - droits);

    return {
      resultat: fmtE(droitsTotaux) + ' au total',
      explication: `L'actif net successoral de ${fmtE(actifNet)} est partagé entre ${nbHeritiers} héritier(s) (${lien}). Après l'abattement de ${fmtE(abattement)} par héritier, les droits de succession sont de ${fmtE(droits)} par héritier, soit ${fmtE(droitsTotaux)} au total.`,
      details: [
        `Actif net de la succession : ${fmtE(actifNet)}`,
        `Nombre d'héritiers : ${nbHeritiers}`,
        `Part par héritier : ${fmtE(partParHeritier)}`,
        `Abattement légal (${lien}) : -${fmtE(abattement)}`,
        `Base imposable par héritier : ${fmtE(baseImposable)}`,
        `Droits par héritier : ${fmtE(droits)}`,
        `Droits totaux : ${fmtE(droitsTotaux)}`,
        `Net reçu par héritier : ${fmtE(netRecuParHeritier)}`,
        'Abattement enfant : 100 000 € renouvelable tous les 15 ans.',
      ]
    };
  }

  // ─── 6. Simulateur IFI ────────────────────────────────────────────────────
  function calcIFI(data, R) {
    const actifImmo = parseFloat(data.actif_immobilier);
    const passif = parseFloat(data.passif) || 0;
    if (!actifImmo || actifImmo <= 0) return null;

    const actifNet = round2(actifImmo - passif);
    const seuil = R.ifi_seuil; // 1 300 000 €

    if (actifNet < seuil) {
      return {
        resultat: '0 € (sous le seuil)',
        explication: `Votre patrimoine immobilier net de ${fmtE(actifNet)} est inférieur au seuil d'assujettissement à l'IFI (${fmtE(seuil)}). Vous n'êtes pas redevable de l'IFI.`,
        details: [`Actif immobilier brut : ${fmtE(actifImmo)}`, passif > 0 ? `Passif déductible : -${fmtE(passif)}` : null, `Actif net : ${fmtE(actifNet)}`, `Seuil IFI : ${fmtE(seuil)}`].filter(Boolean)
      };
    }

    // Barème IFI 2026
    const baremeIFI = [
      { min: 0,         max: 800000,  taux: 0 },
      { min: 800000,    max: 1300000, taux: 0.005 },
      { min: 1300000,   max: 2570000, taux: 0.007 },
      { min: 2570000,   max: 5000000, taux: 0.010 },
      { min: 5000000,   max: 10000000,taux: 0.0125 },
      { min: 10000000,  max: 1e9,     taux: 0.015 },
    ];

    // Décote si actif net entre 1,3M et 1,4M
    let decote = 0;
    if (actifNet < 1400000) {
      decote = round2(17500 - actifNet * 0.0125);
    }

    let ifi = 0;
    const detailsTranches = [];
    for (const b of baremeIFI) {
      if (actifNet <= b.min) break;
      const base = Math.min(actifNet, b.max) - b.min;
      const part = round2(base * b.taux);
      ifi += part;
      if (b.taux > 0 && base > 0) detailsTranches.push(`Tranche ${(b.taux * 100 * 10).toFixed(0) / 10}‰ : ${fmtE(part)}`);
    }
    ifi = round2(Math.max(0, ifi - decote));

    return {
      resultat: fmtE(ifi) + ' / an',
      explication: `Avec un patrimoine immobilier net de ${fmtE(actifNet)}, vous êtes assujetti à l'IFI. Votre cotisation est estimée à ${fmtE(ifi)}/an. ${decote > 0 ? `Une décote de ${fmtE(decote)} s'applique.` : ''}`,
      details: [
        `Actif immobilier brut : ${fmtE(actifImmo)}`,
        passif > 0 ? `Passif déductible (emprunts, taxes…) : -${fmtE(passif)}` : null,
        `Patrimoine net imposable : ${fmtE(actifNet)}`,
        ...detailsTranches,
        decote > 0 ? `Décote (patrimoine < 1,4M€) : -${fmtE(decote)}` : null,
        `IFI estimé : ${fmtE(ifi)}/an`,
        `IFI mensuel : ~${fmtE(round2(ifi / 12))}`,
        'La résidence principale bénéficie d\'un abattement de 30% sur sa valeur vénale.',
      ].filter(Boolean)
    };
  }

  // ─── Registre ────────────────────────────────────────────────────────────
  if (!window.CALCULATEURS_JS) window.CALCULATEURS_JS = {};
  Object.assign(window.CALCULATEURS_JS, {
    'simulateur-impot-revenu':        function(d) { return calcImpotRevenu(d, window.RATES); },
    'calcul-prelevement-a-la-source': function(d) { return calcPrelevementSource(d, window.RATES); },
    'calcul-plus-value-mobiliere':    function(d) { return calcPlusValueMobiliere(d, window.RATES); },
    'simulateur-dividendes':          function(d) { return calcDividendes(d, window.RATES); },
    'calcul-droits-succession':       function(d) { return calcDroitsSuccession(d, window.RATES); },
    'simulateur-ifi':                 function(d) { return calcIFI(d, window.RATES); },
  });

})();

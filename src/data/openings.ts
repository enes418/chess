import type { OpeningEntry } from '../types/chess';

export const CHESS_OPENINGS: OpeningEntry[] = [
  {
    id: 'italian-game',
    eco: 'C50',
    name: 'İtalyan Açılışı',
    movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4'],
    description:
      'Satrancın en eski ve en saygın açılışlarından biridir. Beyaz hızla filini c4 karesine geliştirerek hassas f7 karesini hedefler ve c3-d4 ile merkez hakimiyeti kurmaya hazırlanır.',
    whitePlan:
      'c3 ve d4 ile güçlü bir piyon merkezi kurmak, kısa rok atmak ve a2-g8 çaprazı ile e dikeyi üzerinden baskı oluşturmak.',
    blackPlan:
      '...d5 ile merkezi hemen karşılamak veya ...d6, ...O-O ve ...a6 oynayarak siyah kareli fili koruyup sağlam bir simetri sürdürmek.',
    keyThemes: ['f7 Çapraz Baskısı', 'd4 Merkez Yürüyüşü', 'Şah Güvenliği'],
    popularity: 'Çok Yüksek · Kulüp ve Büyükusta Seviyesi',
  },
  {
    id: 'sicilian-defense',
    eco: 'B20',
    name: 'Sicilya Savunması',
    movesSan: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
    description:
      '1. e4 hamlesine karşı Siyahın en keskin ve en yüksek kazanma oranına sahip yanıtıdır. Siyah c-piyonuyla d4 karesi için asimetrik bir mücadele başlatarak vezir kanadında dinamik karşı saldırı şansı arar.',
    whitePlan:
      'Merkezde ve şah kanadında alan kazanmak, İngiliz Atağı (Be3, f3, Qd2) ile uzun rok atmak veya klasik Be2 ve O-O ile gelişmek.',
    blackPlan:
      'Yarı açık c-dikeyini kontrol etmek, ...b5 ve ...Bb7 ile vezir kanadında genişlemek ve Beyazın e4 piyonuna baskı kurmak.',
    keyThemes: ['Asimetrik Piyon Yapısı', 'Yarı Açık c-Dikeyi', 'Ters Kanat Rokları'],
    popularity: 'Usta Seviyesinde En Popüler Seçim',
  },
  {
    id: 'french-defense',
    eco: 'C00',
    name: 'Fransız Savunması',
    movesSan: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+'],
    description:
      'Siyahın ...d5 sürüşünü ...e6 ile desteklediği dirençli bir karşı saldırı savunmasıdır. Kilitli piyon zincirleri ve Beyazın d4 tabanına yönelik stratejik mücadeleler doğurur.',
    whitePlan:
      'e5 alan üstünlüğünü korumak, d4 piyonunu savunmak ve Siyahın rok atmış şahına yönelik şah kanadı atağı geliştirmek.',
    blackPlan:
      'Beyaz piyon zincirinin tabanına ...c5 ve ...f6 ile saldırmak, beyaz kareli fili ...b6 ve ...Ba6 üzerinden oyuna sokmak.',
    keyThemes: ['Piyon Zincirleri', 'd4 Tabanına Saldırı', 'Kötü vs İyi Fil'],
    popularity: 'Yüksek · Konumsal ve Karşı Saldırı',
  },
  {
    id: 'queens-gambit',
    eco: 'D30',
    name: 'Vezir Gambiti',
    movesSan: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O'],
    description:
      'Klasik satrancın temel taşlarından biridir. Beyaz, Siyahın d5 piyonunu merkezden saptırmak için c4 piyonunu önerir; uzun vadeli merkez kontrolü ve vezir kanadında azınlık saldırısı hedefler.',
    whitePlan:
      'Nc3 ve Bg5 ile d5 üzerindeki baskıyı artırmak, Bd3/Nf3 ile gelişip e4 sürüşü veya vezir kanadı azınlık saldırısı yapmak.',
    blackPlan:
      'd5 kalesini sağlam tutmak, vezir kanadı filini ...b6 veya ...dxc4 ile açmak ve ...c5 ile merkezde karşı oyun kurmak.',
    keyThemes: ['Merkez Kontrolü', 'Azınlık Saldırısı', 'Carlsbad Yapısı'],
    popularity: 'Klasik Dünya Şampiyonası Standardı',
  },
  {
    id: 'ruy-lopez',
    eco: 'C60',
    name: 'İspanyol Açılışı (Ruy Lopez)',
    movesSan: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
    description:
      'Adını 16. yüzyıl İspanyol rahip Ruy López de Segura’dan alan bu açılış, c6 atı üzerinden e5 piyonuna erken baskı kurar ve derin stratejik manevralara zemin hazırlar.',
    whitePlan:
      'Erken rok atmak, Re1, c3 ve d4 ile güçlü bir piyon merkezi kurmak, ardından b1 atını d2-f1-g3 rotasından şah kanadına aktarmak.',
    blackPlan:
      'Gerektiğinde ...a6 ve ...b5 ile fili püskürtmek, e5 noktasını savunmak veya ...d5 ile Marshall Atağı başlatmak.',
    keyThemes: ['e5 Üzerinde Uzun Vadeli Baskı', 'Nbd2-f1-g3 Manevrası', 'Kapalı ve Açık Merkez'],
    popularity: 'Dünya Şampiyonalarının Vazgeçilmezi',
  },
  {
    id: 'kings-indian-defense',
    eco: 'E60',
    name: 'Şah Hint Savunması',
    movesSan: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'],
    description:
      'Fischer ve Kasparov’un gözdesi olan hipermodern bir güç merkezidir. Siyah, Beyazın geniş bir piyon merkezi kurmasına izin verir ve ardından ...e5 veya ...c5 ile merkezi sarsıp şah kanadında fırtına koparır.',
    whitePlan:
      'Siyahın şah kanadı saldırısı ulaşmadan c5, b4 ve Rc1 ile vezir kanadından yarma harekâtı yapmak.',
    blackPlan:
      '...e5 ile merkezi kilitlemek veya zorlamak, f6 atını çekip ...f5, ...g5 ve ...f4 piyon fırtınasıyla şaha saldırmak.',
    keyThemes: ['Hipermodern Fianchetto', 'Karşılıklı Kanat Saldırıları', '...f5 Piyon Fırtınası'],
    popularity: 'Dinamik ve Mücadeleci Tercih',
  },
  {
    id: 'london-system',
    eco: 'D02',
    name: 'Londra Sistemi',
    movesSan: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5', 'c3', 'Nc6', 'Nd2', 'e6'],
    description:
      'Beyaz için kaya gibi sağlam, evrensel bir sistemdir. Siyah kareli fili e3 oynamadan önce f4 karesine çıkararak neredeyse her Siyah kurulumuna uyum sağlayan c3-d4-e3 piramit yapısını oluşturur.',
    whitePlan:
      'd4 karesini c3 ve e3 ile güçlendirmek, e5 ileri karakoluna at yerleştirmek ve duruma göre şah kanadı atağı (Bd3, Qf3, g4) veya sakin konumsal oyun seçmek.',
    blackPlan:
      'Erken ...c5 ve ...Qb6 ile Beyazın açık karelerini zorlamak veya ...Bd6 ve ...Nd7 ile e5 karesini kontrol etmek.',
    keyThemes: ['Piramit Piyon Yapısı', 'e5 İleri Karakolu', 'Az Teori Yükü'],
    popularity: 'Tüm Seviyelerde Hızla Yükselen Sistem',
  },
];

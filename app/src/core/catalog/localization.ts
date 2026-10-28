/** Source-gated language corrections; nutrients and original descriptions never change. */
export function improveUsdaName(name: string, original: string): string {
  let result = name;
  const correct = (source: RegExp, translated: RegExp, replacement: string) => {
    if (source.test(original)) result = result.replace(translated, replacement);
  };
  correct(/\bground\b/i, /земля|земельн(?:ый|ая|ое)/giu, 'фарш');
  correct(/\bfree range\b/i, /свободный (?:выбор|ассортимент|диапазон)/giu, 'свободный выпас');
  correct(/\blight meat\b/i, /легк(?:ое|ого) мяс[оа]/giu, 'белое мясо');
  correct(/\btrimmed\b/i, /подстриженн/giu, 'зачищенн');
  correct(/\brib eye\b/i, /р[её]берн(?:ый|ого) глаз(?:а)?/giu, 'рибай');
  correct(
    /\bvariety meats and by-products\b/i,
    /(?:разнообразное мясо|различные виды мяса|разнообразные мясные продукты) и побочные продукты/giu,
    'субпродукты',
  );
  correct(/\bchitterlings\b/i, /щебетани[ея]|щебетаний|читтерлинги/giu, 'свиные кишки');
  correct(/\bgiblets\b/i, /перчатки/giu, 'потроха');
  correct(/\bfryers\b/i, /жаровни|фритюрницы/giu, 'цыплята для жарки');
  correct(/\bdrumstick/i, /барабанн(?:ая|ой|ые) палочк(?:а|и)/giu, 'голень');
  correct(/\bnuggets\b/i, /самородки/giu, 'наггетсы');
  correct(/\bcorn dogs?\b/i, /кукурузн(?:ая|ые) собак(?:а|и)/giu, 'корн-дог');
  correct(/\bhot dogs?\b/i, /горяч(?:ая|ие) собак(?:а|и)/giu, 'хот-дог');
  correct(/\bbisque\b/i, /бисквит/giu, 'биск');
  correct(/\bicings?\b/i, /обледенени(?:ем|ями|й|е|я)/giu, 'глазурь');
  correct(/\bfillings\b/i, /пломб/giu, 'начинок');
  correct(
    /\bcream of wheat\b/i,
    /сливки пшеницы|крем из пшеницы/giu,
    'пшеничная каша Cream of Wheat',
  );
  correct(/\bsour cream\b/i, /^сметаны/iu, 'Сметана');
  correct(/\bsour cream.*\blight\b/i, /свет/giu, 'пониженной жирности');
  correct(/\bcottage cheese\b/i, /коттеджный сыр|сыр, творог/giu, 'зернёный сыр (cottage cheese)');
  result = result.replace(/\s+/gu, ' ').trim();
  return result.charAt(0).toLocaleUpperCase('ru-RU') + result.slice(1);
}

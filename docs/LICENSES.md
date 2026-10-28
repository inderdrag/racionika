# Лицензии

## В приложении

Профиль → «О приложении и лицензии». Полные тексты лицензий 25 установленных
runtime-пакетов JavaScript/Capacitor (включая транзитивные npm-зависимости)
поставляются офлайн в `app/src/data/licenses.json`. Это не лицензия на
саму Рационику и не инвентаризация серверных или build/dev-зависимостей.

Воспроизводимость: `node scripts/licenses.mjs`, затем
`npx --no-install prettier --write app/src/data/licenses.json`. Скрипт обходит
`dependencies` приложения, сохраняет фактические LICENSE/NOTICE/OFL из
установленных пакетов и останавливается, если текст лицензии не найден.
При обновлении зависимостей inventory нужно пересоздать.

Нативный APK также содержит AndroidX (Apache-2.0), Kotlin (Apache-2.0),
Apache Cordova (Apache-2.0) и нативные части Capacitor (MIT).
Фактические версии зависят от Gradle-resolve. Для проверки используйте
`:app:dependencies --configuration releaseRuntimeClasspath`; это отдельный
слой от npm inventory. Нельзя объявлять npm-список полным списком всех
AAR/JAR внутри APK. При публичном распространении нужно сверить также
транзитивные Gradle-зависимости и их NOTICE.

Данные USDA FoodData Central SR Legacy 2018 и FNDDS 2021–2023 опубликованы
под CC0 1.0 Universal: https://fdc.nal.usda.gov/api-guide .
505 названий локализованы в исходной выборке; названия расширения переведены
автоматически (Argos English–Russian 1.9) с сохранением оригиналов.
Модель перевода, её обучающие наборы и ML-библиотеки не распространяются
в приложении и не нужны для сборки или поиска. Сведения о переводе и
контрольная сумма использованной модели — в extended-manifest.json.
Open Food Facts: ODbL 1.0 (база), Database Contents License (отдельное
содержимое), CC BY-SA 3.0 (фотографии, в приложении не используются).
Условия: https://world.openfoodfacts.org/terms-of-use .
Адаптированная офлайн-выборка 7 368 продуктов российского рынка распространяется
под ODbL 1.0, отдельно от USDA CC0. Вся выборка с источником/лицензиями доступна
в приложении: Профиль → О приложении и лицензии → Экспорт открытой базы.
Она не содержит персональных данных. Код приложения остаётся MIT.
ODbL: https://opendatacommons.org/licenses/odbl/1-0/
DbCL: https://opendatacommons.org/licenses/dbcl/1-0/
Подробнее о наборе: `docs/FOOD_CATALOG.md`.

Manrope: SIL Open Font License, Copyright 2019 The Manrope Project Authors.

## Manrope — полный текст OFL

Copyright 2019 The Manrope Project Authors (https://github.com/sharanda/manrope)

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at:
http://scripts.sil.org/OFL

---

SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1. Neither the Font Software nor any of its individual components,
   in Original or Modified Versions, may be sold by itself.

2. Original or Modified Versions of the Font Software may be bundled,
   redistributed and/or sold with any software, provided that each copy
   contains the above copyright notice and this license. These can be
   included either as stand-alone text files, human-readable headers or
   in the appropriate machine-readable metadata fields within text or
   binary files as long as those fields can be easily viewed by the user.

3. No Modified Version of the Font Software may use the Reserved Font
   Name(s) unless explicit written permission is granted by the corresponding
   Copyright Holder. This restriction only applies to the primary font name as
   presented to the users.

4. The name(s) of the Copyright Holder(s) or the Author(s) of the Font
   Software shall not be used to promote, endorse or advertise any
   Modified Version, except to acknowledge the contribution(s) of the
   Copyright Holder(s) and the Author(s) or with their explicit written
   permission.

5. The Font Software, modified or unmodified, in part or in whole,
   must be distributed entirely under this license, and must not be
   distributed under any other license. The requirement for fonts to
   remain under this license does not apply to any document created
   using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

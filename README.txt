KYK Management System v1.4.6

変更内容
- v1.4.4のPDF除外、Excel出力のみの構成を維持しました。
- 作業1～4の実施人員合計に合わせて、作業員入力欄を自動で表示します。
- 実施人員合計2名なら作業員1～2、6名なら作業員1～6だけを表示します。
- 実施人員合計は1名以上8名以内です。
- 人数を減らしたとき、非表示になる作業員欄に入力済みデータがある場合は確認を表示します。
- ZIP内のフォルダ名とファイル名は文字化け防止のため英数字です。

注意
- KYKDB.xlsxは同梱していません。
- Excel読込用のSheetJSは現段階では従来どおり外部参照です。外部参照の同梱化は別段階で実施します。


v1.4.6 changes
- Bundled SheetJS locally as js/xlsx.full.min.js
- Updated index.html and Service Worker for offline SheetJS loading
- Added spacing between the two buttons on the journal auto-create screen

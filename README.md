# lss

lss は [GNU coreutils ls](https://www.gnu.org/software/coreutils/manual/html_node/ls-invocation.html) とほぼ同じ機能に加えて以下の機能を付加した
[Node.js](http://nodejs.org) のアプリケーションです。

  * [sixel](https://en.wikipedia.org/wiki/Sixel) 形式でアイコンおよびサムネイルを表示します
  * 表示されるアイコンはデスクトップ環境が表示するものと同等です（テーマにも追従します）
  * デスクトップ環境がインストールされていないシステムでもそれなりのアイコンを表示します
  * 画像、動画、PDF、フォントなどのサムネイルもデスクトップ環境にインストールされたサムネイラーを用いて同等のものを生成します
  * 出力結果が端末の高さを超えている場合に less などのページャを起動します

![showing multiple directories](https://appsweets.net/lss/image/lss-multi-dirs.png "複数のディレクトリの表示")
![detailed output and paging](https://appsweets.net/lss/image/lss-detail-paging.png "詳細な出力とページング")
![running lss on vscode](https://appsweets.net/lss/image/lss-vscode-ja.png "vscode 上の lss")

一方、ls にあるが lss にはない機能は以下の通りです。

  * セキュリティコンテキストの表示(`-Z / --context`) - coreutils は SELinux と smack をサポートしていますが、
  なぜ他の LSM はサポート外なのか？ がよく分からないので実装していません
  * emacs の dired 用表示(`-D / --dired`) - emacs 使いではないので実装していません


## インストール

### 想定環境

lss は現在 Linux 上で動作します。また開発とテストは Ubuntu 上で行っています。
以下、端末への入力例およびパッケージの情報は Ubuntu（あるいは Debian）を想定したものです。

サムネイルについては以下の端末エミュレータ（あるいは他のアプリケーション）で表示を確認しました:

  * [Black Box](https://gitlab.gnome.org/raggesilver/blackbox)
  * [foot](https://codeberg.org/dnkl/foot)
  * [mlterm](https://github.com/arakiken/mlterm)
  * [wezterm](https://wezfurlong.org/wezterm/)
  * [vscode](https://code.visualstudio.com/)


### lss のインストール

まず [Node.js](http://nodejs.org) が必要です。v18 くらいあれば動くと思います。

任意のディレクトリに lss の git リポジトリをクローンし（以下、このローカルのリポジトリを `<リポジトリ>` と記述します）、npm を用いてインストールします。

```bash
$ git clone https://github.com/akahuku/lss.git
$ cd lss
$ npm install
```

`npm install` により必要なモジュールと、定期的にサムネイルキャッシュを消去するための
systemd タイマーがインストールされます。


### アドオンのビルド

以下の lss の機能は Node.js の標準モジュールでは提供されていないため、専用のアドオンを
用います。このアドオンをビルドしなくても lss はこれらの機能を表の代替プログラムを
呼び出すことで実現しますが、パフォーマンスはよくありません。そのためインストールと
併せてアドオンをビルドすることをおすすめします。

機能 | 代替プログラム
---- | ----
uid/gid 番号から名前への変換 | getent
個々のファイルの capability 情報の取得 | getcap
個々のファイルの mime タイプの取得 | file
個々のファイルの拡張属性の取得・設定 | getfattr / setfattr

アドオンをビルドするためには以下のプログラムおよび開発用ファイルが必須です。

名前 | パッケージ
---- | ----
gcc | build-essential
magic.h | libmagic-dev
sys/capability.h | libcap-dev

ローカルにインストールされていないパッケージがあればインストールしてください。

```bash
$ sudo apt install libmagic-dev libcap-dev
```

準備が整ったらビルドします:

```bash
$ cd <リポジトリ>
$ npm run build
```


### アイコン/サムネイル表示のための準備

アイコンおよびサムネイル表示のためにいくつかのプログラムが内部で呼び出されます。そのため以下のプログラムが必要です。

名前 | パッケージ
---- | ----
gsettings | libglib2.0-bin
gio | libglib2.0-bin
gdk-pixbuf-thumbnailer | libgdk-pixbuf2.0-bin
convert | imagemagick

ローカルにインストールされていないパッケージがあればインストールしてください。

```bash
$ sudo apt install imagemagick
  :
```

なお、`imagemagick` パッケージは sixel の出力に対応したバージョンである必要があります。

```bash
$ convert -list format|grep -i sixel
      SIX* SIXEL     rw-   DEC SIXEL Graphics Format
    SIXEL* SIXEL     rw-   DEC SIXEL Graphics Format
```

grep で出力される行の第 3 フィールドに `w` があることを確認してください。


## 使い方

`<リポジトリ>/bin/lss` が実行ファイルです。このファイルにパスを通すか、すでに通っている場所に
このファイルへのシンボリックリンクを置くことでどこでも実行できます。

基本的には、ls の使用法をそのまま lss に適用できます（`-Z / -D / --context / --dired` スイッチを除く）。
くわえて、lss 独自のスイッチがあります:

スイッチ | 説明
------- | ----
--drop-types=_types_ | 指定したタイプ（後述）を表示から外します
--select-types=_types_ | 指定したタイプ（後述）のみを表示します
-P, --pager=_pager_ | 表示が端末の高さを超える場合に使用するページャの名前を指定します
--header | -l と併用することでヘッダ行を表示します
-y, --thumbnail | `-C / -g / -l / -n / -o / -x` と併用することでアイコンおよびサムネイルを表示します
--no-thumbnail | サムネイルを表示しません
--invalidate-thumbnail-cache | サムネイルキャッシュを無効化し、lss に対して再生成を促します
--collation=_method_ | ファイル名のソートに用いる方式を指定します（あまり有用ではない）
--diag | 端末の情報などを表示します<br/>![diag result](https://appsweets.net/lss/image/diag.png)
--verbose | エラーが発生した際に詳細な情報を表示します

すべてのスイッチは `lss --help` で表示されます。


### drop-types / select-types に指定できるタイプ

以下の文字列をカンマ区切りで指定します。これらの文字列はあいまいさがない限り最小で1文字まで省略できます:

  * fifo
  * chardev
  * blockdev
  * directory
  * normal | regular
  * symbolic_link | link
  * sock
  * whiteout

![file types](https://appsweets.net/lss/image/file-types.png)


### pager に指定できるページャ

以下のいずれかの文字列を指定します:

  * $PAGER - この文字列は実行時に環境変数 PAGER の値に置換されます。デフォルトです
  * less
  * more
  * pg
  * most
  * none | off


### collation に指定できるソート方式

以下のいずれかの文字列を指定します:

  * intl - javascript の Intl オブジェクトを用いてソートします。デフォルトです
  * codepoint - UTF-16 単位のコードポイントでソートします
  * byte - UTF-8 でエンコードした際の各バイトでソートします


## TIPS

### 定型的スイッチの指定

環境変数 LSS_OPTIONS を定義して lss を起動すると、その値がコマンドラインの***前***に付加されているかのように動作します。
これにより、常に付加されてほしいスイッチを指定することができます。

`~/.bashrc` や `~/.zshrc` に

```bash
export LSS_OPTIONS="-BF --color=auto --group-directoires-first"
```

などと追加しておくとよいでしょう。


### lss.json による独自の色設定

`--color` スイッチによりファイルの拡張子ごとにエスケープシーケンスによる色付けを行いますが、
この色分けは ls と同様に環境変数 LS_COLORS に基づきます。これ以外の要素に対する設定は
lss.json で行います。`<リポジトリ>/lss.json` を

  * 環境変数 XDG_CONFIG_DIR が設定してある場合は、`$XDG_CONFIG_DIR/lss.json`
  * そうでなければ `~/.config/lss.json`

にコピーし、任意に編集してください（ただし、まだ設定できる項目は多くありません）。


### サムネイルキャッシュ

2 回目以降の表示を高速化するため、アイコンやサムネイルはキャッシュされます。キャッシュの場所は

  * 環境変数 XDG_CACHE_HOME が設定してある場合は、`$XDG_CACHE_HOME/thumbnails/sixel/<terminal-key>/`
  * そうでなければ `~/.cache/thumbnails/sixel/<terminal-key>/`

です。ここで terminal-key は `<サムネイルの高さピクセル>-<1行の高さピクセル>-<背景色>` です。

`npm install` する過程でこのキャッシュをメンテナンスするための systemd タイマーユニット
`lss-prune.timer` および実際にキャッシュを操作するサービスユニット `lss-prune.service` が
`~/.config/systemd/user` 下に置かれます。これらのユニットは 1 日 1 回起動され、最後にアクセスされてから
30 日を超えて経過しているキャッシュを削除します。

ここで、実際にキャッシュをメンテナンスするために呼ばれるスクリプトは `<リポジトリ>/bin/prune`
です。このスクリプトをシェルから直接呼び出してもかまいません。


### ソート方式の差異

ls はファイル名を strcoll()、より正確にはそれぞれのユーザーのロケールで定義される方式でソートします。
一方 lss はデフォルトで Intl オブジェクトでソートします。この 2 つの方式は完全に別個のものであるため
ソート結果が同様となる保証はありません。

例えばアルファベットの大文字小文字、ダイアクリティカルマークを伴なった結合文字列、
異体字セレクタによって修飾された文字などでソート結果が異なる可能性があります。

![collation](https://appsweets.net/lss/image/collation.png)


## ライセンス

lss は [GPL v3](https://www.gnu.org/licenses/gpl-3.0.html) の下で公開されます。

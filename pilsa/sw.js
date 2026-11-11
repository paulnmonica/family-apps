// 필사 달력 서비스 워커
// 앱 파일을 고친 뒤에는 VERSION 숫자를 올려 주세요. 그래야 휴대폰에 새 버전이 들어가요.
const APP = 'pilsa';
const VERSION = 'v2';
const FILES = [
  './', './index.html', './manifest.webmanifest', './sentences.js',
  '../shared/common.css', '../shared/common.js',
  './icons/icon-192.png', './icons/icon-512.png',
];
importScripts('../shared/sw-core.js');

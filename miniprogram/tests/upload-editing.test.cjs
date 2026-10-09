const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup(size = 1024) {
  let definition, selected;
  let uploads = 0;
  const wx = {
    getStorageSync: () => '',
    chooseMedia: options => { selected = options; },
    chooseMessageFile: options => { selected = options; },
    showActionSheet: options => options.success({ tapIndex: 0 }),
    getFileSystemManager: () => ({ getFileInfo: options => options.success({size}) }),
    showToast: () => {}, showModal: () => {},
  };
  const api = {uploadExam: () => { uploads++; return Promise.resolve({id:1}); }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/upload/upload.js'),'utf8'), {
    wx, Page: value => { definition = value; },
    require: name => name.endsWith('/api') ? api : name.endsWith('/imageSize') ? require('../utils/imageSize') : {GRADE_OPTIONS:['六年级'],EXAM_STATUS:{},formatDate:()=>''},
  });
  const page = {...definition, data:{...definition.data},setData(value){Object.assign(this.data,value);}};
  return {page,choose(file = {tempFilePath:'raw.jpg'}){selected.success({tempFiles:[file]});},options:()=>selected,
    confirm(){page.confirmImageEdit({detail:{tempFilePath:'edited.jpg'}});},cancel(){page.cancelImageEdit();},uploads:()=>uploads};
}

test('选图后先编辑，不把原图设为上传对象', () => {
  const flow=setup(); flow.page.chooseImage(); flow.choose();
  assert.equal(flow.page.data.editing,true);
  assert.equal(flow.page.data.previewImage,'');
  flow.page.upload(); assert.equal(flow.uploads(),0);
  flow.confirm(); assert.equal(flow.page.data.previewImage,'edited.jpg');
  assert.equal(flow.page.data.editing,false);
});

test('上传图片优先使用原始文件名，编辑导出不改变名称', () => {
  const flow = setup();
  flow.page.chooseImageSource('message');
  assert.equal(flow.options().type, 'image');
  flow.choose({ name: '数学试卷.png', path: 'wxfile://tmp/random.png' });
  flow.confirm();
  assert.equal(flow.page.data.name, '数学试卷.png');
  flow.page.reeditImage();
  flow.confirm();
  assert.equal(flow.page.data.name, '数学试卷.png');
});

test('拍照默认使用日期时间，来源单独指定为相机', () => {
  const flow = setup();
  flow.page.chooseImageSource('camera');
  assert.equal(flow.options().sourceType[0], 'camera');
  assert.equal(flow.options().sourceType.length, 1);
  assert.equal(flow.page.imageName({}, 'camera', new Date(2026, 9, 9, 8, 4, 5)), '2026-10-09 08:04:05');
  flow.choose();
  flow.confirm();
  assert.match(flow.page.data.name, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('换图更新自动名称，但保留手动填写的名称', () => {
  const flow = setup();
  flow.page.data.name = '上一张.jpg';
  flow.page.chooseImage(); flow.choose({name:'下一张.jpg',tempFilePath:'wxfile://tmp/random.jpg'}); flow.confirm();
  assert.equal(flow.page.data.name, '下一张.jpg');
  flow.page.onName({ detail: { value: '数学月考' } });
  flow.page.chooseImage(); flow.choose(); flow.confirm();
  assert.equal(flow.page.data.name, '数学月考');
});

test('相册未返回真实文件名时使用日期时间，不使用随机临时文件名', () => {
  const flow = setup();
  const file = { tempFilePath: 'wxfile://tmp/3Wxo-m9H37R-ebb77692045ad192.jpg' };
  assert.equal(flow.page.imageName(file, 'album', new Date(2026, 9, 9, 8, 4, 5)), '2026-10-09 08:04:05');
  flow.page.chooseImage(); flow.choose(file); flow.confirm();
  assert.match(flow.page.data.name, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.ok(!flow.page.data.name.includes('3Wxo'));
});

test('编辑取消保留之前已确认的图片', () => {
  const flow=setup(); flow.page.data.previewImage='previous.jpg';
  flow.page.chooseImage(); flow.choose(); flow.cancel();
  assert.equal(flow.page.data.previewImage,'previous.jpg');
  assert.equal(flow.page.data.editing,false);
  assert.equal(flow.uploads(),0);
});

test('编辑结果过大不替换已确认图片', () => {
  const flow=setup(11*1024*1024); flow.page.data.previewImage='previous.jpg';
  flow.page.chooseImage(); flow.choose(); flow.confirm();
  assert.equal(flow.page.data.previewImage,'previous.jpg');
  assert.equal(flow.page.data.editing,false);
});

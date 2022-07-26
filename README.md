# 介绍
mcr-bridge 能够让你以一种比较简单的方式实现微前端项目的组件嵌入功能, ta基于的是前端
三大框架(react,angular,vue)的动态创建组件的方法。

## 什么是动态创建组件
在基于三大框架的前端项目中, 我们要使用一个组件一般都是将组件作为一个标签写在html模板中。
框架在解析模板时会为组件创建实例并挂载组件视图, 这时候''创建组件实例和挂载组件视图''这
个过程是由框架来完成的, 而当这个过程是由我们开发者的业务代码来实现时, 那便是动态创建组
件。

## 三大框架动态创建组件的方法

### vue2
```javascript
......

import Vue from 'vue';
import HelloWorld from './components/HelloWorld.vue'

export default {
  name: 'App',
  components: {
    HelloWorld
  },
  mounted() {
    const componentContainer = document.getElementById('hello-world-container');
    const componentConstructor = Vue.extend(HelloWorld); // 生成组件构造函数
    new componentContainer({
        parent: this 
    }).$mount(componentContainer); // 实例化组件并挂载组件视图
  }
}

......
```

### angular
```typescript
import { ApplicationRef, Component, ComponentFactoryResolver, ElementRef, Injector, ViewChild } from '@angular/core';
import { CpntComponent } from './cpnt/cpnt.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  @ViewChild('container') container: ElementRef = null as any

  title = 'bridge-ng';
  constructor(
    private injector: Injector,
    private applicationRef: ApplicationRef,
    private resolver: ComponentFactoryResolver
  ) {

  }
  ngAfterViewInit() {
    const componentFactory = this.resolver.resolveComponentFactory(CpntComponent); // 创建组件工厂
    const componentRef = componentFactory.create(this.injector); // 生成ComponentRef
    this.applicationRef.attachView(componentRef.hostView); // 缺了这一步组件的changes detection 会失效
    this.container.nativeElement.appendChild(componentRef.location.nativeElement); // 挂载组件视图，就是普通的dom操作，把组件视图的根节点插入到项目的dom结构中
  }
}
```
### react
```typescript
import * as ReactDom from 'react-dom';
import * as React from 'react';
import { App } from './App';

const appContainer = document.getElementById('app-container')

ReactDom.render(React.createElement(App), appContainer)
``` 

## 利用动态创建组件的方法嵌合主子项目
假如有基于angular的主项目ng_app和基于vue的子项目vue_app, vue_app启动时需要加载js
文件http://localhost:8080/chunk-vendor.js和http://localhost:8080/app.js。

#### 首先，在vue_app中添加以下代码
```javascript
......

export default {
  name: 'App',
  components: {
    HelloWorld
  },
  created() {
    window.vueComponentFactory = () => {
      let componentConstructor = Vue.extend(HelloWorld);
      return new componentConstructor({
        parent: this
      })
    }
    if (window.loadResolver) window.loadResolver();
  }
}

......

```
#### 在ng_app中用script标签按顺序加载vue_app的js文件
```typescript
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  @ViewChild('container') container: ElementRef = null as any

  ......
  
  ngAfterViewInit() {
    this.loadProject().then(res => {
      let vueComponentInstance = (window as any).vueComponentFactory(); // 调用vueComponentFactory获取vue_app的HelloWorld组件实例
      vueComponentInstance.$mount(this.container.nativeElement); // vue_app的HelloWorld组件嵌入到ng_app的app-root组件中

    })
  }

  loadProject() {
    const assetList = [
      'http://localhost:8080/chunk-vendor.js',
      'http://localhost:8080/app.js'
    ]
    return new Promise((resolve, reject) => {
      (window as any).loadResolver = resolve; // 在vue_app中调用window.loadResolver()表明window.vueComponentFactory已添加
      const doLoad = (index: number) => {
          if (index >= assetList.length) {
              return 
          }
          const scriptEle = document.createElement('script');
          const assetPath = assetList[index];

          scriptEle.onload = () => {
              doLoad(index + 1) // vue_app的js资源按顺序逐个加载并运行
          }

          scriptEle.onerror = (err) => {
              reject(err)
          }

          scriptEle.src = assetPath;
          document.body.appendChild(scriptEle);
      }
      doLoad(0)
    })
  }
}
```
### 以上就是利用动态创建件组件的方法嵌合主子项目的过程，而mcr-bridge封装了一些可以简化以上过程的api

# 使用mcr-bridge

## 快速开始
```bash
npm install --save mcr-bridge
```
## 在主项目中通过mcr-bridge嵌入子项目组件
```typescript
import 'mcr-bridge';

......

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  @ViewChild('container') container: ElementRef = null as any

  ......

  ngAfterViewInit() {
    const global: any = window;
    global.$bridge.instance.setConfig({
     projects: {
       'vue_app': {
          path: 'http://localhost:8080',
          jsonp: 'loadChunks.js'
       }
     }
   })
   global.$bridge.instance.loadProject('vue_app'/*子项目唯一标识*/).then(() => {
    global.$bridge.instance.mountCpnt(
        'vue_app', 
        'helloWorld', // 子项目组件唯一标识 
        this.container.nativeElement)
   });
  }
}
```

## 在子项目中注册组件到mcr-bridge中(子项目中不需要引入mcr-bridge)

### 1.基于vue的子项目注册组件
```javascript
import Vue from 'vue';
import HelloWorld from './components/HelloWorld.vue'

export default {
  name: 'App',
  components: {
    HelloWorld
  },
  created() {
    if (window.$bridge) {
      const componentFactory = window.$bridge.resolveVueCpntFactory(Vue.extend(HelloWorld), this);
      window.$bridge.instance.registerCpnt('vue_app', 'helloWorld', componentFactory);
      global.$bridge.instance.loaded('vue_app') // 通知主项目该子项目已加载完成  
    }
  }
}
```

### 2.基于react的子项目注册组件
```typescript
import * as ReactDom from 'react-dom';
import * as React from 'react';
import { App } from './App';

// ReactDom.render(<App name="hello"></App>, document.getElementById('app'));
const global: any = window as any;
if (global.$bridge) {
    const componentFactory = global.$bridge.resolveReactCpntFactory(App, React, ReactDom);
    global.$bridge.instance.registerCpnt('React_app', 'app', componentFactory);
    global.$bridge.instance.loaded('React_app') // 通知主项目该子项目已加载完成
}
```

### 3.基于angular的子项目注册组件

#### 低于angular13的版本
```typescript
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  ......

  constructor(
    private injector: Injector,
    private applicationRef: ApplicationRef,
    private resolver: ComponentFactoryResolver,
    private zone: NgZone
  ) {

  }
  ngAfterViewInit() {
    const global: any = window;
    if (global.$bridge) {
      const factory = global.$bridge.resolveNgCpntFactory(CpntComponent, this.resolver, this.applicationRef, this.injector, this.zone);
      global.$bridge.instance.registerCpnt(
        'ng_app', // 子项目的唯一标识
        'cpnt', // 子项目组件的唯一标识
        factory
      )
      global.$bridge.instance.loaded('ng_app') // 通知主项目该子项目已加载完成
    }
  }
}
```

#### angular13以上的版本
```typescript
import { 
    ......

    ɵNG_COMP_DEF, 
    ɵRender3ComponentFactory, 

    ......    

} from '@angular/core';

......

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  constructor(
      private injector: Injector,
      private applicationRef: ApplicationRef,
      private resolver: ComponentFactoryResolver,
      private zone: NgZone
  ) {
  
  }
  ......

  ngAfterViewInit() {
    const global: any = window;
    if (global.$bridge) {
      const factory = global.$bridge.resolveNgCpntFactory2(
        CpntComponent[ɵNG_COMP_DEF], 
        ɵRender3ComponentFactory, 
        this.applicationRef, 
        this.injector,
        this.zone
      );
      global.$bridge.instance.registerCpnt(
        'ng_app', // 子项目的唯一标识
        'cpnt', // 子项目组件的唯一标识
        factory
      )
      global.$bridge.instance.loaded('ng_app') // 通知主项目该子项目已加载完成
    }
  }
}
```

## 在子项目中生成loadChunks.js文件

### 子项目中需要一个loadChunks.js文件让主项目能够通过jsonp的方式知道该子项目需要加载哪一些资源

#### loadChunks.js
```javascript
window.$bridge.instance.loadProjectJsonp("vue_app", {
    js:["js/chunk-vendors.f4b13c22.js", 'js/app.8c4d252c.js'],
    css:["css/app.30bf6194.css"]}
);
```
通过webpack生成模式打包编译生成的js文件都会拼上hash代码，这就导致每一次打包编译生成的文件名都不一样,
而每次打包后都手动更改loadChunks.js的内容显然是很麻烦的事情。

### 使用mcr-bridge-plugin.js 自动生成loadChunks.js文件
```javascript
const MicroBridgePlugin = require('mcr-bridge/plugin/mcr-bridge-plugin')

module.exports = {
    plugins: [
        new MicroBridgePlugin({
            projectName: 'vue_app' //项目标识,
            js: {
                files: ['lodash.js'] // 添加除了打包生成的额外js文件,
                exclude: ['zone.js', /\.shared.js$/],
                sort: function(file1, file2) {
                    if (file1 === 'lodash.js') return 1;
                    if (file2 === 'lodash.js') return -1;
                    return 0    
                } 
            },
            css: {}
        })
    ]
}
```

## API

### window.$bridge.instance.setConfig(config: Object)
设置配置项。

### window.$bridge.instance.getConfig()
获取配置项。

### window.$bridge.instance.loadProjecttConfig(projectName: string): Promise
加载子项目。

### window.$bridge.instance.loaded(projectName)
在子项目中调用，告诉主项目自已已加载完成。

### window.$bridge.instance.registerCpnt(projectName: string, componentId: string, componentFactory: Function)
在子项目中注册组件到mcr-bridge。

### window.$bridge.instance.mountCpnt(projectName: string, componentId: string, componentAnchor: HTMLElement, props?: any)
把子项目的组件挂载带主项目中。

## 如有问题，请邮件联系!! 邮箱：nicholasking0816@168.com
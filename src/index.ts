export class MicroBridge {
    private _config: any = {};
    private _projectMap: Map<string, Map<string, any>> = new Map();
    private _loadedProject: Map<string, boolean> = new Map();
    private _promiseResolverMap: any = {}
    constructor() {}

    private _getCpntFactoryMap(projectName: string) {
        let cpntFactoryMap = this._projectMap.get(projectName);
        if (!cpntFactoryMap) this._projectMap.set(projectName, cpntFactoryMap = new Map());
        return cpntFactoryMap;
    }

    setConfig(config: any) {
        this._config = config;
    }   

    getConfig() {
        return this._config;
    }

    loadProject(projectName: string) {
        return new Promise((resolve, reject) => {
            const scriptEle = document.createElement('script');
            const project = this._config.projects[projectName]; 

            this._promiseResolverMap[projectName] = {resolve, reject};
            scriptEle.onload = () => {
                document.body.removeChild(scriptEle)
            }
            scriptEle.src = project.path + '/' + project.jsonp;
            document.body.appendChild(scriptEle);
        })        
    }

    loaded(projectName) {
        const resolver = this._promiseResolverMap[projectName];
        if (resolver) {
            resolver.resolve()
        }
    }

    loadProjectJsonp(projectName: string, asset: any ) {
        const assetList = asset.js;
        const cssList = asset.css;
        const project = this._config.projects[projectName];
        const resolver = this._promiseResolverMap[projectName];
        
        const doLoad = (index: number) => {
            if (index >= assetList.length) {
                this._loadedProject.set(projectName, true)
                return;
            }
            const scriptEle = document.createElement('script');
            const assetPath = assetList[index];
            index ++;

            scriptEle.onload = () => {
                doLoad(index)
            }
    
            scriptEle.onerror = (err) => {
                resolver.reject(err)
            }

            scriptEle.src = project.path + '/' + assetPath;
            document.body.appendChild(scriptEle);
        }

        doLoad(0);   
        cssList.forEach((href: string) => {
            const link = document.createElement('link');
            link.href = href;
            document.body.appendChild(link);
        })     
    }

    registerCpnt(projectName: string, id: string, cpntFactory: Function) {
        this._getCpntFactoryMap(projectName).set(id, cpntFactory)
    }

    mountVueCpnt(cpntProfile: any, cpntAnchor: HTMLElement) {
        cpntProfile.instance.$mount(cpntAnchor);
        return {
            componentInstance: cpntProfile.instance,
            destroy() {
                cpntProfile.instance.$destroy()
            }
        }
    }

    mountReactCpnt(cpntProfile: any, cpntAnchor: HTMLElement) {
        return {
            componentInstance: cpntProfile.ReactDom.render(cpntProfile.component, cpntAnchor),
            destroy() {
                cpntProfile.ReactDom.unmountComponentAtNode(cpntAnchor)
            }
        }
        
    }

    mountNgCpnt(cpntProfile: any, cpntAnchor: HTMLElement) {
        return cpntProfile.componentRefPromise.then(componentRef => {
            cpntAnchor.appendChild(componentRef.location.nativeElement);
            return {
                componentInstance: componentRef.instance,
                componentRef: componentRef,
                destroy() {
                    componentRef.destroy();
                }
            }
        })
    }

    mountCpnt(projectName: string, cpntId: string, cpntAnchor: HTMLElement, props?: any) {
        const doMount = () => {
            const cpntMap = this._projectMap.get(projectName);
            if (!cpntMap) {
                throw new Error(`Project '${projectName}' is not exist`)
            }
            const cpntFactory = cpntMap.get(cpntId);
            if (!cpntFactory) {
                throw new Error(`component '${cpntId}' is not exist on project '${projectName}'`)
            }

            const cpntProfile = cpntFactory(props);

            switch(cpntProfile.type) {
                case 'VUE_COMPONENT':
                    return this.mountVueCpnt(cpntProfile, cpntAnchor);
                case 'REACT_COMPONENT':
                    return this.mountReactCpnt(cpntProfile, cpntAnchor);
                case 'NG_COMPONENT':
                    return this.mountNgCpnt(cpntProfile, cpntAnchor);            
            }
            return null;
        }

        if (!this._loadedProject.get(projectName)) {
            return this.loadProject(projectName).then(() => {
                return doMount()
            })
        } else {
            return Promise.resolve(doMount());
        }
    }
}

const bridge: any = MicroBridge;

bridge.resolveReactCpntFactory = function(cpntCotr: any, React: any, ReactDom: any) {
    return function(props: any) {
        return {
            component: React.createElement(cpntCotr, props),
            ReactDom: ReactDom,
            type: 'REACT_COMPONENT'
        }
    }
}

bridge.resolveVueCpntFactory = function(cpntCotr: any, parent: any) {
    return function(props: any) {
        return {
            instance: new cpntCotr({
                parent: parent,
                props: props
            }),
            type: 'VUE_COMPONENT'
        }
    }
}

bridge.resolveNgCpntFactory2 = function(cpnt: any, ComponentFactory: any, applicationRef: any, injector: any, zone: any) {
    return function(props: any) {
        return {
            type: 'NG_COMPONENT',
            componentRefPromise: new Promise((resolve) => {
                zone.run(() => {
                    const componentRef = new ComponentFactory(cpnt).create(injector);
                    if (props) {
                        Object.assign(componentRef.instance, props)
                    }
                    applicationRef.attachView(componentRef.hostView);
                    resolve(componentRef)
                })
                
            })
        }
    }
}

bridge.resolveNgCpntFactory = function(cpnt: any, ComponentFactoryResolve: any, applicationRef: any, injector: any, zone: any) {
    return function(props: any) {
        return {
            type: 'NG_COMPONENT',
            componentRefPromise: new Promise(resolve => {
                zone.run(() => {
                    const componentRef = ComponentFactoryResolve.resolveComponentFactory(cpnt).create(injector);
                    if (props) {
                        Object.assign(componentRef.instance, props)
                    }
                    applicationRef.attachView(componentRef.hostView);
                    resolve(componentRef)
                })
            })
        }
    }
}

bridge.instance = new MicroBridge();

(window as any).$mcrBridge = bridge;

import React from 'react';

type ParamList = Record<string, object | undefined>;

type NavigationFn<Params> = (screen: string, params?: Params) => void;

type Route<Name extends string, Params> = {
  key: string;
  name: Name;
  params?: Params;
};

export type NativeStackScreenProps<
  List extends ParamList,
  Name extends keyof List,
> = {
  navigation: {
    navigate: NavigationFn<List[keyof List]>;
    setParams: (params: Partial<List[Name]>) => void;
    goBack: () => void;
    replace: NavigationFn<List[keyof List]>;
  };
  route: Route<Name & string, List[Name]>;
};

type ScreenProps<List extends ParamList, Name extends keyof List> = {
  name: Name;
  component?: React.ComponentType<any>;
  children?: (props: NativeStackScreenProps<List, Name>) => React.ReactNode;
  options?: Record<string, unknown>;
};

type NavigatorProps<List extends ParamList> = {
  children?: React.ReactNode;
  initialRouteName?: keyof List;
};

export function createNativeStackNavigator<List extends ParamList>() {
  const Navigator: React.FC<NavigatorProps<List>> = ({ children }) => <>{children}</>;
  const Screen = <Name extends keyof List>({ children, component: Component }: ScreenProps<List, Name>) => {
    if (Component) {
      return <Component />;
    }
    if (typeof children === 'function') {
      const props: NativeStackScreenProps<List, Name> = {
        navigation: {
          navigate: () => {},
          setParams: () => {},
          goBack: () => {},
          replace: () => {},
        },
        route: {
          key: 'mock',
          name: '' as Name & string,
          params: undefined,
        },
      };
      return <>{children(props)}</>;
    }
    return <>{children}</>;
  };
  return { Navigator, Screen };
}

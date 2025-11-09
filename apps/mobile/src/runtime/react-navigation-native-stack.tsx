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
  };
  route: Route<Name & string, List[Name]>;
};

type ScreenProps<List extends ParamList> = {
  name: keyof List;
  component?: React.ComponentType<any>;
  children?: (props: NativeStackScreenProps<List, keyof List>) => React.ReactNode;
  options?: Record<string, unknown>;
};

type NavigatorProps = {
  children?: React.ReactNode;
};

export function createNativeStackNavigator<List extends ParamList>() {
  const Navigator: React.FC<NavigatorProps> = ({ children }) => <>{children}</>;
  const Screen: React.FC<ScreenProps<List>> = ({ children, component: Component }) => {
    if (Component) {
      return <Component />;
    }
    if (typeof children === 'function') {
      const props: NativeStackScreenProps<List, keyof List> = {
        navigation: {
          navigate: () => {},
          setParams: () => {},
          goBack: () => {},
        },
        route: {
          key: 'mock',
          name: '' as keyof List & string,
          params: undefined,
        },
      };
      return <>{children(props)}</>;
    }
    return <>{children}</>;
  };
  return { Navigator, Screen };
}

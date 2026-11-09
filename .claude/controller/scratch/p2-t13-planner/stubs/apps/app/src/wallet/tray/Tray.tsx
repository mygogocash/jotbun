// RED stub (P2-T13): the interface, and the title and content in a Modal. The real tray is in the planner's real/.
import type { ReactNode } from 'react';
import { Modal, Text, View } from 'react-native';

export type TrayProps = {
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  title: string;
  header?: ReactNode;
  onBack?: () => void;
  step?: string;
  footer?: ReactNode;
  locked?: boolean;
  children: ReactNode;
  testID?: string;
};

export function Tray({ visible, title, children }: TrayProps) {
  return (
    <Modal visible={visible} transparent animationType="none">
      <View testID="tray">
        <Text>{title}</Text>
        {children}
      </View>
    </Modal>
  );
}

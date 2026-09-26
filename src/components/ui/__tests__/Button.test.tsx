import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders the label', () => {
    render(<Button label="Sign in" onPress={() => {}} />);
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Button label="Sign in" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Sign in" onPress={onPress} disabled />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('hides the label and shows a spinner while loading', () => {
    render(<Button label="Sign in" onPress={() => {}} loading />);
    expect(screen.queryByText('Sign in')).toBeNull();
  });
});
